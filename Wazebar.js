// ==UserScript==
// @name         WME Wazebar
// @namespace    https://greasyfork.org/users/30701-justins83-waze
// @version      2024.10.05.02
// @description  Displays a bar at the top of the editor that displays inbox, forum & wiki links
// @author       JustinS83
// @include      https://beta.waze.com/*
// @include      https://www.waze.com/discuss/*
// @include      https://webnew.waze.com/discuss/*
// @include      https://www.waze.com/editor*
// @include      https://www.waze.com/*/editor*
// @exclude      https://www.waze.com/user/editor*
// @require      https://greasyfork.org/scripts/27254-clipboard-js/code/clipboardjs.js
// @require      https://greasyfork.org/scripts/24851-wazewrap/code/WazeWrap.js
// @connect      status.waze.com
// @connect      storage.googleapis.com
// @connect      greasyfork.org
// @grant        GM_xmlhttpRequest
// @contributionURL https://github.com/WazeDev/Thank-The-Authors
// @downloadURL https://update.greasyfork.org/scripts/27604/WME%20Wazebar.user.js
// @updateURL https://update.greasyfork.org/scripts/27604/WME%20Wazebar.meta.js
// ==/UserScript==

/*  --------  Add these back before and remove  require http://localhost:8080/Wazebar.js before Submit! -----------
#require      http://localhost:8080/Wazebar.js    # Local server URL
#updateURL    http://localhost:8080/Wazebar.js    # Local server URL
#downloadURL  http://localhost:8080/Wazebar.js    # Local server URL
*/

/* global W */
/* ecmaVersion 2017 */
/* global $ */
/* global I18n */
/* global _ */
/* global WazeWrap */
/* global require */

var WazeBarSettings = [];
var isBeta = false;
//var inboxInterval; // Inbox is no longer part of the /discuss platform
var forumInterval;
var forumPage = false;
var currentState = "";
var States = {};
var forumUnreadOffset = 0;
const SCRIPT_VERSION = GM_info.script.version.toString();
const SCRIPT_NAME = GM_info.script.name;
const DOWNLOAD_URL = GM_info.script.fileURL;
var curr_ver = GM_info.script.version;

(function () {
    "use strict";

    function bootstrap(tries = 1) {
        if (
            (/forum/.test(location.href) &&
                $("#control_bar_handler").css("visibility") === "visible") ||
            (typeof W != "undefined" &&
                W &&
                W.map &&
                W.model &&
                W.loginManager.user &&
                $ &&
                W.model.getTopState() &&
                $(".app.container-fluid.show-sidebar").length > 0)
        ) {
            preinit();
        } else if (tries < 1000)
            setTimeout(function () {
                bootstrap(++tries);
            }, 200);
    }

    bootstrap();

    function preinit() {
        isBeta = /beta/.test(location.href);
        forumPage = /forum/.test(location.href);

        if (forumPage) {
            loadScript("https://use.fontawesome.com/73f886e1d5.js", null);
            loadScript(
                "https://ajax.googleapis.com/ajax/libs/jquery/1.6.1/jquery.min.js",
                init
            );
            forumUnreadOffset = 25;
        } else {
            loadScriptUpdateMonitor();
            init();
        }
    }

    function loadScriptUpdateMonitor() {
        let updateMonitor;
        try {
            updateMonitor = new WazeWrap.Alerts.ScriptUpdateMonitor(
                SCRIPT_NAME,
                SCRIPT_VERSION,
                DOWNLOAD_URL,
                GM_xmlhttpRequest
            );
            updateMonitor.start();
        } catch (ex) {
            // Report, but don't stop if ScriptUpdateMonitor fails.
            console.error(`${SCRIPT_NAME}:`, ex);
        }
    }

    function loadScript(url, callback) {
        var script = document.createElement("script");
        script.type = "text/javascript";

        if (script.readyState) {
            //IE
            script.onreadystatechange = function () {
                if (script.readyState == "loaded" || script.readyState == "complete") {
                    script.onreadystatechange = null;
                    if (callback != null) callback();
                }
            };
        } else {
            //Others
            script.onload = function () {
                if (callback != null) callback();
            };
        }

        script.src = url;
        document.getElementsByTagName("head")[0].appendChild(script);
    }

    function init() {
        LoadSettingsObj();
        LoadStatesObj();
        if (!forumPage || (forumPage && WazeBarSettings.DisplayWazeForum)) {
            if (!forumPage && W.model.getTopState() !== null) {
                currentState = getCurrentState();
                W.map.events.register("zoomend", this, function () {
                    setTimeout(updateCurrentStateEntries, 100);
                });
                W.map.events.register("moveend", this, function () {
                    setTimeout(updateCurrentStateEntries, 100);
                });
                W.model.events.register("mergeend", this, function () {
                    setTimeout(updateCurrentStateEntries, 100);
                });
            }

            injectCss();
            BuildWazebar();
            BuildSettingsInterface();
        }
    }

    function getCurrentState() {
        if (W.model.getTopState().attributes === undefined)
            return W.model.getTopState().getName();
        else return W.model.getTopState().attributes.name;
    }

    function updateCurrentStateEntries() {
        if (W.model.getTopState() !== null && currentState != getCurrentState()) {
            //user panned/zoomed to a different state, so we need to update the current state forum & wiki entries
            BuildWazebar();
            currentState = getCurrentState();
        }
    }

    function BuildWazebar() {
        $("#Wazebar").remove();
        var $Wazebar = $("<div>", { id: "Wazebar", style: "min-height: 20px;" });
        $Wazebar.html(
            [
                '<div class="WazeBarIcon" id="WazeBarSettingsButton"><i class="fa fa-cog" aria-hidden="true"></i></div>',
                '<div class="WazeBarIcon" id="WazeBarRefreshButton"><i class="fa fa-refresh" aria-hidden="true"></i></div>',
                '<div class="WazeBarIcon" id="WazeBarFavoritesIcon"><i class="fa fa-star" aria-hidden="true"></i>',
                '<div id="WazeBarFavorites">',
                '<ul id="WazeBarFavoritesList"></ul>',
                '<div id="WazeBarFavoritesAddContainer">',
                '<input type="text" id="WazeBarURL" placeholder="URL">',
                '<input type="text" id="WazeBarText" placeholder="Label">',
                '<button id="WazeBarAddFavorite">Add</button>',
                "</div>",
                "</div>",
                "</div>",
                // Other forum links
                WazeBarSettings.WMEBetaForum
                    ? '<div class="WazeBarText WazeBarForumItem" id="WMEBetaForum"><a href="' +
                    location.origin +
                    '/forum/viewforum.php?f=211" ' +
                    LoadNewTab() +
                    ">WME Beta</a></div>"
                    : "",
                WazeBarSettings.scriptsForum
                    ? '<div class="WazeBarText WazeBarForumItem" id="Scripts"><a href="' +
                    location.origin +
                    '/discuss/c/editors/addons-extensions-and-scripts/3984" ' +
                    LoadNewTab() +
                    ">Scripts</a></div>"
                    : "",
                WazeBarSettings.USSMForum
                    ? '<div class="WazeBarText WazeBarForumItem" id="USSMForum"><a href="' +
                    location.origin +
                    '/discuss/c/editors/united-states/us-state-managers/4890" ' +
                    LoadNewTab() +
                    ">US SM</a></div>"
                    : "",
                WazeBarSettings.USChampForum
                    ? '<div class="WazeBarText WazeBarForumItem" id="USChampForum"><a href="' +
                    location.origin +
                    '/forum/viewforum.php?f=338" ' +
                    LoadNewTab() +
                    ">US Champ</a></div>"
                    : "",
                WazeBarSettings.USWikiForum
                    ? '<div class="WazeBarText WazeBarForumItem" id="USWikiForum"><a href="' +
                    location.origin +
                    '/discuss/c/editors/united-states/us-wiki-discussion/4894" ' +
                    LoadNewTab() +
                    ">US Wiki</a></div>"
                    : "",
                BuildRegionForumEntries(),
                BuildStateForumEntries(),
                BuildStateUnlockEntries(),
                BuildCustomEntries(),
                BuildRegionWikiEntries(),
                BuildStateWikiEntries(),
                BuildCurrentStateEntries(),
                WazeBarSettings.NAServerUpdate
                    ? '<div style="display: inline;" id="WazebarStatus">NA Server Update: </div>'
                    : "",
                WazeBarSettings.ROWServerUpdate
                    ? '<div style="display: inline;" id="WazebarStatusROW">ROW Server Update: </div>'
                    : "",
            ].join("")
        );

        if (forumPage) {
            $(".main_content").prepend($Wazebar);
            $("#Wazebar").css({
                "z-index": "9999999",
                "margin-left": "20px",
                "background-color": "white",
                width: "100%",
                top: "0",
            });
        } else {
            $(".app.container-fluid.show-sidebar").before($Wazebar);
        }

        checkForums();
        StartIntervals();

        // Event handler for settings button to show the settings dialog
        $("#WazeBarSettingsButton").click(function () {
            $("#WazeBarSettings").fadeIn();
        });

        $("#WazeBarAddFavorite").click(function () {
            var url = $("#WazeBarURL").val();
            var text = $("#WazeBarText").val();
            if (url !== "" && text !== "") {
                if (!(url.startsWith("http://") || url.startsWith("https://"))) {
                    url = "http://" + url;
                }
                WazeBarSettings.Favorites.push({ href: url, text: text });
                $("#WazeBarURL").val("");
                $("#WazeBarText").val("");
                LoadFavorites();
                SaveSettings();
                //LoadSettingsObj(); // add by JS55CT
            }
        });

        $("#WazeBarFavoritesIcon").mouseleave(function () {
            $("#WazeBarFavorites").css({ display: "none" });
        });

        $("#WazeBarFavoritesIcon").mouseenter(function () {
            $("#WazeBarFavorites").css({ display: "block" });
        });

        LoadFavorites();
        //LoadSettingsObj(); // add by JS55CT

        $("#WazeBarFavoritesList a").click(function () {
            $("#WazeBarFavorites").css({ display: "none" });
        });

        if (WazeBarSettings.NAServerUpdate) {
            GM_xmlhttpRequest({
                method: "GET",
                url: "https://storage.googleapis.com/waze-tile-build-public/release-history/na-feed-v2.xml",
                onload: ParseStatusFeed,
            });
        }

        if (WazeBarSettings.ROWServerUpdate) {
            GM_xmlhttpRequest({
                method: "GET",
                url: "https://storage.googleapis.com/waze-tile-build-public/release-history/intl-feed-v2.xml",
                onload: ParseStatusFeed,
            });
        }

        $("#WazeBarRefreshButton").click(function () {
            $("#WazeBarRefreshButton i").addClass("fa-spin");
            window.clearInterval(forumInterval);
            checkForums();
            StartIntervals();
            $("#WazeBarRefreshButton i").removeClass("fa-spin");
        });

        // Function for setting height dynamically
        const setHeightForAppContainer = () => {
            const wazebarHeight = $("#Wazebar").height();
            $("body > div.app.container-fluid.show-sidebar").css(
                "height",
                `calc(100vh - ${wazebarHeight}px)`
            );
            window.dispatchEvent(new Event("resize")); // Adjust WME editing area

            if (forumPage) {
                $(".navigation").css("top", `${wazebarHeight}px`);
            }
        };

        // Initially set height for the app container
        setHeightForAppContainer();
    }

    function LoadSettingsInterface() {
        $("#txtWazebarSettings")[0].innerHTML = localStorage.Wazebar_Settings;
        SelectedRegionChanged();
        setChecked("WazeForumSetting", WazeBarSettings.DisplayWazeForum);
        setChecked("WMEBetaForumSetting", WazeBarSettings.WMEBetaForum);
        setChecked("ScriptsForum", WazeBarSettings.scriptsForum);
        setChecked("USSMForumSetting", WazeBarSettings.USSMForum);
        if (!forumPage)
            setChecked("USChampForumSetting", WazeBarSettings.USChampForum);
        setChecked("USWikiForumSetting", WazeBarSettings.USWikiForum);
        setChecked("NAServerUpdateSetting", WazeBarSettings.NAServerUpdate);
        setChecked("ROWServerUpdateSetting", WazeBarSettings.ROWServerUpdate);
        $("#forumInterval")[0].value = WazeBarSettings.forumInterval;
        $("#WazeBarFontSize")[0].value = WazeBarSettings.BarFontSize;
        $("#WazeBarUnreadPopupDelay")[0].value = WazeBarSettings.UnreadPopupDelay;
    }

    function LoadNewTab() {
        return forumPage ? "" : ' target="_blank"';
    }

    function LoadFavorites() {
        const favoritesList = $("#WazeBarFavoritesList");
        favoritesList.empty(); // Clear the list

        // For each favorite, append a structured item
        WazeBarSettings.Favorites.forEach((favorite, index) => {
            const listItem = $(`
                <li class="favorite-item">
                    <a href="${favorite.href}" target="_blank">${favorite.text}</a>
                    <i class="fa fa-times" title="Remove from favorites" data-index="${index}"></i>
                </li>
            `);
            favoritesList.append(listItem);
        });

        // Use event delegation to handle the removal of items
        favoritesList.on("click", ".fa-times", function () {
            const index = $(this).data("index");
            WazeBarSettings.Favorites.splice(index, 1);
            SaveSettings();
            LoadFavorites(); // Reload the updated favorites list
            //LoadSettingsObj(); // add by JS55CT
        });
    }

    function LoadCustomLinks() {
        const customList = $("#WazeBarCustomLinksList");
        customList.empty(); // Clear the list

        // For each custom link, append a structured item
        WazeBarSettings.CustomLinks.forEach((customLink, index) => {
            const listItem = $(`
                <li class="custom-item">
                    <a href="${customLink.href}" target="_blank">${customLink.text}</a>
                    <i class="fa fa-times" title="Remove custom link" data-index="${index}"></i>
                </li>
            `);
            customList.append(listItem);
        });

        // Use event delegation to handle the removal of items
        customList.on("click", ".fa-times", function () {
            const index = $(this).data("index");
            WazeBarSettings.CustomLinks.splice(index, 1);
            SaveSettings();
            LoadCustomLinks();
            //LoadSettingsObj(); // add by JS55CT
            BuildWazebar();
        });

        $("#WazeBarCustomLinksList").prepend(links);

        $('[id^="WazeBarCustomLinksListClose"]').click(function () {
            WazeBarSettings.CustomLinks.splice(
                Number(this.id.replace("WazeBarCustomLinksListClose", "")),
                1
            );
            SaveSettings();
            LoadCustomLinks();
            //LoadSettingsObj(); // add by JS55CT
            BuildWazebar();
        });
    }


    function StartIntervals() {
        // inboxInterval = setInterval(GetPMCount, WazeBarSettings.inboxInterval * 60000); // only used for Inbox is no longer needed with /discuss platform
        forumInterval = setInterval(
            checkForums,
            WazeBarSettings.forumInterval * 60000
        );
    }

    function checkForums() {
        if (WazeBarSettings.WMEBetaForum)
            checkUnreadTopics(
                location.origin + "/forum/viewforum.php?f=211",
                "WMEBetaForum",
                "WMEBetaForumCount"
            );
        if (WazeBarSettings.scriptsForum)
            checkUnreadTopics(
                location.origin +
                "/discuss/c/editors/addons-extensions-and-scripts/3984",
                "Scripts",
                "ScriptsCount"
            ); //Scripts
        if (WazeBarSettings.USSMForum)
            checkUnreadTopics(
                location.origin +
                "/discuss/c/editors/united-states/us-state-managers/4890",
                "USSMForum",
                "USSMForumCount"
            );
        if (WazeBarSettings.USChampForum)
            checkUnreadTopics(
                location.origin + "/forum/viewforum.php?f=338",
                "USChampForum",
                "USChampForumCount"
            );
        if (WazeBarSettings.USWikiForum)
            checkUnreadTopics(
                location.origin +
                "/discuss/c/editors/united-states/us-wiki-discussion/4894",
                "USWikiForum",
                "USWikiForumCount"
            );

        Object.keys(WazeBarSettings.header).forEach(function (state, index) {
            if (WazeBarSettings.header[state].forum)
                checkUnreadTopics(
                    WazeBarSettings.header[state].forum.replace(
                        "https://www.waze.com",
                        location.origin
                    ),
                    state.replace(" ", "_") + "Forum",
                    state.replace(" ", "_") + "ForumCount"
                );

            if (WazeBarSettings.header[state].unlock) {
                var url =
                    location.origin +
                    "/forum/search.php?keywords=" +
                    state +
                    "&terms=all&author=&sv=0&fid%5B%5D=622&sc=1&sf=titleonly&sr=topics&sk=t&sd=d&st=0&ch=300&t=0&submit=Search";
                if (state === "Virginia")
                    url =
                        location.origin +
                        "/forum/search.php?keywords=-West%2BVirginia&terms=all&author=&sv=0&fid%5B%5D=622&sc=1&sf=titleonly&sr=topics&sk=t&sd=d&st=0&ch=300&t=0&submit=Search";
                checkUnreadTopics(
                    url,
                    state.replace(" ", "_") + "Unlock",
                    state.replace(" ", "_") + "UnlockCount"
                );
            }
        });
        Object.keys(WazeBarSettings.header.region).forEach(function (
            region,
            index
        ) {
            if (WazeBarSettings.header.region[region].forum)
                checkUnreadTopics(
                    WazeBarSettings.header.region[region].forum.replace(
                        "https://www.waze.com",
                        location.origin
                    ),
                    region.replace(/\s/g, "") + "Forum",
                    region.replace(/\s/g, "") + "ForumCount"
                );
        });

        for (var i = 0; i < WazeBarSettings.CustomLinks.length; i++) {
            if (WazeBarSettings.CustomLinks[i].href.includes("/forum"))
                checkUnreadTopics(
                    WazeBarSettings.CustomLinks[i].href.replace(
                        "https://www.waze.com",
                        location.origin
                    ),
                    WazeBarSettings.CustomLinks[i].text.replace(/\s/g, "") + i + "Forum",
                    WazeBarSettings.CustomLinks[i].text.replace(/\s/g, "") +
                    i +
                    "ForumCount"
                );
        }
    }

    function checkUnreadTopics(path, parentID, spanID) {
        var count = 0;
        $.get(path, function (page) {
            var result = page.match(/topic_unread/g);
            count += result ? result.length : 0;
            result = page.match(/sticky_unread/g);
            count += result ? result.length : 0;
            result = page.match(/announce_unread/g);
            count += result ? result.length : 0;

            $("#" + spanID).remove();
            if (count > 0) {
                $("#" + parentID + " a").append(
                    `<span style='color:red;font-weight:bold;' id='${spanID}'> (${count})<div class='WazeBarUnread' id='WazeBarUnread${spanID}' style='visibility:hidden; animation: ${WazeBarSettings.UnreadPopupDelay
                    }s fadeIn; animation-fill-mode: forwards; left:${$("#" + parentID).position().left
                    }px; top:${parseInt($("#" + parentID).height()) + forumUnreadOffset
                    }px;'><div class='WazeBarUnreadList' id='WazeBarUnreadList${spanID}''></div></div></span>`
                );
                var pattern =
                    /announce_unread.*\s*<dt.*>\s*<a href=".*"\s*.*<\/a>\s*<div class="list-inner.*">\s*.*\s*.*\s*.*\s*(?:.*\s*)?<a href="(.*)"\s*class="boing topictitle.*">\s*(?:<svg.*\s*<path.*\s*<\/svg>\s*)?(?!<img)(.*?)\s*<\/a>/g;
                var unreadItems;

                var links = "";
                $("#WazeBarUnreadList" + spanID).empty();
                while ((unreadItems = pattern.exec(page)) !== null) {
                    links +=
                        '<div style="position:relative;"><a href="' +
                        location.origin +
                        "/forum" +
                        unreadItems[1].replace("amp;", "").substring(1) +
                        '&view=unread#unread"' +
                        LoadNewTab() +
                        ">" +
                        unreadItems[2].replace(
                            'img src="./styles/prosilver/imageset/icon_topic_solved_list.png"',
                            'img src="https://www.waze.com/forum/styles/prosilver/imageset/icon_topic_solved_list.png"'
                        ) +
                        "</a></div>";
                }
                pattern =
                    /sticky_unread">\s*.*\s*.*\s*.*\s*.*\s*.*\s*.*\s*<a href="(.*)"\s*class="boing topictitle.*">\s*(?:<svg.*\s*<path.*\s*<\/svg>\s*)?(.*)\s*<\/a>/g;
                while ((unreadItems = pattern.exec(page)) !== null) {
                    links +=
                        '<div style="position:relative;"><a href="' +
                        location.origin +
                        "/forum" +
                        unreadItems[1].replace("amp;", "").substring(1) +
                        '&view=unread#unread"' +
                        LoadNewTab() +
                        ">" +
                        unreadItems[2] +
                        "</a></div>";
                }
                pattern =
                    /topic_unread.*\s*<dt.*>\s*<a href=".*"\s*.*<\/a>\s*<div class="list-inner.*">\s*.*\s*.*\s*.*\s*(?:.*\s*)?<a href="(.*)"\s*class="boing topictitle.*">\s*(?:<svg.*\s*<path.*\s*<\/svg>\s*)?(?!<img)(.*?)\s*<\/a>/g;
                while ((unreadItems = pattern.exec(page)) !== null) {
                    links +=
                        '<div style="position:relative;"><a href="' +
                        location.origin +
                        "/forum" +
                        unreadItems[1].replace("amp;", "").substring(1) +
                        '&view=unread#unread"' +
                        LoadNewTab() +
                        ">" +
                        unreadItems[2] +
                        "</a></div>";
                }
                $("#WazeBarUnreadList" + spanID).prepend(links);

                $("#" + spanID).mouseleave(function () {
                    $("#WazeBarUnread" + spanID).css({ display: "none" });
                });

                $("#" + spanID).mouseenter(function () {
                    $("#WazeBarUnread" + spanID).css({ display: "block" });
                });

                $("#" + spanID + " a").click(function () {
                    $("#WazeBarUnread" + spanID).css({ display: "none" });
                });
            }
        });

        return count;
    }

    function ParseStatusFeed(data) {
        let re =
            /North America map tiles were successfully updated to: (.*?)<\/title>/;
        let result;
        if (WazeBarSettings.NAServerUpdate) {
            result = new Date(data.responseText.match(re)[1].trim()).toLocaleString();
            if (WazeBarSettings.ROWServerUpdate) result += " | ";
            $("#WazebarStatus").append(result);
        }
        if (WazeBarSettings.ROWServerUpdate) {
            re =
                /International map tiles were successfully updated to: (.*?)<\/title>/;
            result = new Date(data.responseText.match(re)[1].trim()).toLocaleString();
            $("#WazebarStatusROW").append(result);
        }
    }

    function BuildStateForumEntries() {
        var stateForums = "";
        Object.keys(WazeBarSettings.header).forEach(function (state, index) {
            if (WazeBarSettings.header[state].forum)
                stateForums +=
                    '<div class="WazeBarText WazeBarForumItem" id="' +
                    state.replace(" ", "_") +
                    'Forum"><a href="' +
                    WazeBarSettings.header[state].forum.replace(
                        "https://www.waze.com",
                        location.origin
                    ) +
                    '" ' +
                    LoadNewTab() +
                    ">" +
                    WazeBarSettings.header[state].abbr +
                    "</a></div>";
        });
        return stateForums;
    }

    function BuildCurrentStateEntries() {
        var currentState = "";
        if (!forumPage && typeof W.model.countries.objects[235] !== "undefined") {
            //only do for the US
            var currState = getCurrentState();
            currentState +=
                '<div class="WazeBarText WazeBarCurrState" id="' +
                currState.replace(" ", "_") +
                'ForumCurrState"><a href="' +
                States[currState].forum.replace(
                    "https://www.waze.com",
                    location.origin
                ) +
                '" ' +
                LoadNewTab() +
                ">" +
                States[currState].abbr +
                "</a></div>";
            currentState +=
                '<div class="WazeBarText WazeBarCurrState"><a href="' +
                States[currState].wiki +
                '" target="_blank">' +
                States[currState].abbr +
                " Wiki</a></div>";
        }
        return currentState;
    }

    function BuildCustomEntries() {
        var customList = "";
        if (WazeBarSettings.CustomLinks && WazeBarSettings.CustomLinks.length > 0) {
            //forum entries first
            for (var i = 0; i < WazeBarSettings.CustomLinks.length; i++) {
                if (WazeBarSettings.CustomLinks[i].href.includes("/forum"))
                    customList +=
                        '<div class="WazeBarText WazeBarForumItem" id="' +
                        WazeBarSettings.CustomLinks[i].text.replace(/\s/g, "") +
                        i +
                        'Forum"><a href="' +
                        WazeBarSettings.CustomLinks[i].href.replace(
                            "https://www.waze.com",
                            location.origin
                        ) +
                        '" ' +
                        LoadNewTab() +
                        ">" +
                        WazeBarSettings.CustomLinks[i].text +
                        "</a></div>";
            }

            //wiki entries
            for (i = 0; i < WazeBarSettings.CustomLinks.length; i++) {
                if (WazeBarSettings.CustomLinks[i].href.includes("/wiki"))
                    customList +=
                        '<div class="WazeBarText WazeBarWikiItem"><a href="' +
                        WazeBarSettings.CustomLinks[i].href +
                        '" target="_blank">' +
                        WazeBarSettings.CustomLinks[i].text +
                        "</a></div>";
            }
        }
        return customList;
    }

    function BuildStateWikiEntries() {
        var stateWikis = "";
        Object.keys(WazeBarSettings.header).forEach(function (state, index) {
            if (WazeBarSettings.header[state].wiki)
                stateWikis +=
                    '<div class="WazeBarText WazeBarWikiItem"><a href="' +
                    WazeBarSettings.header[state].wiki +
                    '" target="_blank">' +
                    WazeBarSettings.header[state].abbr +
                    " Wiki</a></div>";
        });
        return stateWikis;
    }

    function BuildStateUnlockEntries() {
        var stateUnlocks = "";
        Object.keys(WazeBarSettings.header).forEach(function (state, index) {
            if (WazeBarSettings.header[state].unlock) {
                if (state !== "Virginia")
                    stateUnlocks +=
                        '<div class="WazeBarText WazeBarForumItem" id="' +
                        state.replace(" ", "_") +
                        'Unlock"><a href="' +
                        location.origin +
                        "/forum/search.php?keywords=" +
                        state +
                        '&terms=all&author=&sv=0&fid%5B%5D=622&sc=1&sf=titleonly&sr=topics&sk=t&sd=d&st=0&ch=300&t=0&submit=Search" ' +
                        LoadNewTab() +
                        ">" +
                        WazeBarSettings.header[state].abbr +
                        " Unlock</a></div>";
                else
                    stateUnlocks +=
                        '<div class="WazeBarText WazeBarForumItem" id="' +
                        state.replace(" ", "_") +
                        'Unlock"><a href="' +
                        location.origin +
                        '/forum/search.php?keywords=-West%2BVirginia&terms=all&author=&sv=0&fid%5B%5D=622&sc=1&sf=titleonly&sr=topics&sk=t&sd=d&st=0&ch=300&t=0&submit=Search" ' +
                        LoadNewTab() +
                        ">" +
                        WazeBarSettings.header[state].abbr +
                        " Unlock</a></div>";
                //stateUnlocks += '<div style="display:inline; padding-right:5px; margin-right:5px; border-right:thin solid grey;"><a href="' + WazeBarSettings.header[state].wiki + '" target="_blank">' + WazeBarSettings.header[state].abbr + ' Wiki</a></div>';
            }
        });
        return stateUnlocks;
    }

    function BuildRegionForumEntries() {
        //'<div style="display:inline; padding-right:5px; margin-right:5px; border-right:thin solid grey;" id="GLR"><a href="https://www.waze.com/forum/viewforum.php?f=943" target="_blank">GLR Forum</a></div>',
        var regionForums = "";
        if (WazeBarSettings.header.region) {
            Object.keys(WazeBarSettings.header.region).forEach(function (
                region,
                index
            ) {
                if (WazeBarSettings.header.region[region].forum)
                    regionForums +=
                        '<div class="WazeBarText WazeBarForumItem" id="' +
                        region.replace(" ", "") +
                        'Forum"><a href="' +
                        WazeBarSettings.header.region[region].forum.replace(
                            "https://www.waze.com",
                            location.origin
                        ) +
                        '" ' +
                        LoadNewTab() +
                        ">" +
                        WazeBarSettings.header.region[region].abbr +
                        "</a></div>";
            });
        }
        return regionForums;
    }

    function BuildRegionWikiEntries() {
        //'<div style="display:inline; padding-right:5px; margin-right:5px; border-right:thin solid grey;"><a href="https://wazeopedia.waze.com/wiki/USA/USA/Great_Lakes" target="_blank">GLR Wiki</a></div>',
        var regionWikis = "";
        if (WazeBarSettings.header.region) {
            Object.keys(WazeBarSettings.header.region).forEach(function (
                region,
                index
            ) {
                if (WazeBarSettings.header.region[region].wiki)
                    regionWikis +=
                        '<div class="WazeBarText WazeBarWikiItem"><a href="' +
                        WazeBarSettings.header.region[region].wiki +
                        '" target="_blank">' +
                        WazeBarSettings.header.region[region].abbr +
                        " Wiki</a></div>";
            });
        }
        return regionWikis;
    }

    function BuildSettingsInterface() {
        var $section = $("<div>", { id: "WazeBarSettings" });
        $section.html(
            [
                "<div>",
                "<div class='flex-container' style='margin-bottom: 20px;'>",

                // Start of the Right Flex Column (now the first column)
                "<div class='flex-column right-column'>",
                "<div style='display: flex; flex-direction: column; gap: 16px;'>",
                // Font size with default value
                "<div style='display: flex; align-items: center; gap: 8px;'>",
                "<input type='number' id='WazeBarFontSize' min='8' style='width: 60px;' value='" + WazeBarSettings.BarFontSize + "'/>",
                "<label for='WazeBarFontSize'>Font size</label>",
                "</div>",
                // Forum font color with default value
                "<div style='display: flex; align-items: center; gap: 8px;'>",
                "<input type='color' id='colorPickerForumFont' value='" + WazeBarSettings.ForumFontColor + "'/>",
                "<label for='colorPickerForumFont'>Forum Links Color</label>",
                "</div>",
                // Wiki font color with default value
                "<div style='display: flex; align-items: center; gap: 8px;'>",
                "<input type='color' id='colorPickerWikiFont' value='" + WazeBarSettings.WikiFontColor + "'/>",
                "<label for='colorPickerWikiFont'>Wiki Links Color</label>",
                "</div>",
                // Unread popup delay
                "<div style='display: flex; align-items: center; gap: 8px;'>",
                "<input type='number' id='WazeBarUnreadPopupDelay' min='0' style='width: 60px;' value='" + WazeBarSettings.UnreadPopupDelay + "'/>",
                "<label for='WazeBarUnreadPopupDelay'>Unread popup delay (s)</label>",
                "</div>",
                // Forum check frequency
                "<div style='display: flex; align-items: center; gap: 8px;'>",
                "<input type='number' id='forumInterval' min='1' style='width: 60px;' value='" + WazeBarSettings.forumInterval + "'/>",
                "<label for='forumInterval'>Forum check frequency (mins)</label>",
                "</div>",
                // Horizontal rule before Custom Links section
                "<hr>",

                // Custom Links Section
                "<div id='customLinksSection'>",
                "<h4>Custom Links</h4>",
                "<ul id='WazeBarCustomLinksList'></ul>",
                "<div>",
                "<div style='display: flex; flex-direction: column;'>",
                "<input type='text' id='WazeBarCustomURL' placeholder='Enter URL'/>",
                "<input type='text' id='WazeBarCustomText' placeholder='Enter Link Text'/>",
                "<button id='WazeBarAddCustomLink'>Add</button>",
                "</div>",
                "</div>",
                "</div>",
                "<hr>",

                // Export/Import Section
                "<div id='exportImportSection' style='margin-top: 20px;'>",
                "<h4>Export/Import</h4>",
                "<div class='flex-row' style='align-items: flex-start; gap: 10px;'>",
                "<button class='export-button fa fa-upload' id='btnWazebarCopySettings' title='Copy Wazebar settings to the clipboard' data-clipboard-target='#txtWazebarSettings'></button>",
                "<textarea readonly id='txtWazebarSettings' placeholder='Copied settings will appear here'></textarea>",
                "</div>",
                "<div class='flex-row' style='align-items: flex-start; gap: 10px; margin-top: 10px;'>",
                "<button class='import-button fa fa-download' id='btnWazebarImportSettings' title='Import copied settings'></button>",
                "<textarea id='txtWazebarImportSettings' placeholder='Paste settings here to import'></textarea>",
                "</div>",
                "</div>",
                "</div>",
                "</div>",

                // Start of the Left Flex Column (now the second column)
                "<div class='flex-column left-column'>",
                "<div id='WBDisplayOptions'>",
                "<input type='checkbox' id='WazeForumSetting' /><label for='WazeForumSetting'>Display on Forum pages</label>",
                "<div>",
                "<input type='checkbox' id='WMEBetaForumSetting' /><label for='WMEBetaForumSetting'>WME Beta Forum</label>",
                "<input type='checkbox' id='ScriptsForum' /><label for='ScriptsForum'>Scripts Forum</label>",
                "<input type='checkbox' id='USSMForumSetting' /><label for='USSMForumSetting'>US SM Forum</label>",
                !forumPage && W.loginManager.user.rank >= 5
                    ? "<input type='checkbox' id='USChampForumSetting' /><label for='USChampForumSetting'>US Champ Forum</label>"
                    : "",
                "<input type='checkbox' id='USWikiForumSetting' /><label for='USWikiForumSetting'>US Wiki Forum</label>",
                "<input type='checkbox' id='NAServerUpdateSetting' /><label for='NAServerUpdateSetting'>NA Server Update</label>",
                "<input type='checkbox' id='ROWServerUpdateSetting' /><label for='ROWServerUpdateSetting'>ROW Server Update</label>",
                "</div>",
                "Region " + BuildRegionDropdown(),
                "<input type='checkbox' id='RegionForumSetting'/><label for='RegionForumSetting'>Forum</label> <input type='checkbox' id='RegionWikiSetting'/><label for='RegionWikiSetting'>Wiki</label>",
                "<div id='WBStates' style='margin-top: 16px;'></div>",
                "</div>",
                "</div>",

                "</div>",

                // Bottom section with Save and Cancel buttons
                "<div style='display: flex; justify-content: space-between; margin-top: 20px;'>",
                "<a href='" + location.origin + "/forum/viewtopic.php?f=819&t=219816' target='_blank'>Forum thread</a>",
                "<div>",
                "<button id='WBSettingsSave'>Save</button>",
                "<button id='WBSettingsCancel'>Cancel</button>",
                "</div>",
                "</div>"
            ].join(" ")
        );

        if (forumPage) {
            $("body").append($section);
        } else {
            $("#WazeMap").append($section);
        }

        $("#WazeBarUnreadPopupDelay").keypress(function (event) {
            if (
                !(
                    (event.which >= 48 && event.which <= 57) ||
                    (event.which == 46 && (this.value.match(/\./g) || []).length == 0)
                )
            )
                event.preventDefault();
        });

        $("#RegionForumSetting").change(function () {
            var selectedItem =
                $("#WBRegions")[0].options[$("#WBRegions")[0].selectedIndex];
            var region = selectedItem.value;
            var forum = selectedItem.getAttribute("data-forum");
            var abbr = selectedItem.getAttribute("data-abbr");
            if (!WazeBarSettings.header.region) WazeBarSettings.header.region = {};

            if (WazeBarSettings.header.region[region] == null)
                WazeBarSettings.header.region[region] = {};
            if (this.checked) {
                WazeBarSettings.header.region[region].forum = forum;
                WazeBarSettings.header.region[region].abbr = abbr;
            } else {
                delete WazeBarSettings.header.region[region].forum;
            }
        });

        $("#RegionWikiSetting").change(function () {
            var selectedItem =
                $("#WBRegions")[0].options[$("#WBRegions")[0].selectedIndex];
            var region = selectedItem.value;
            var wiki = selectedItem.getAttribute("data-wiki");
            var abbr = selectedItem.getAttribute("data-abbr");

            if (!WazeBarSettings.header.region) WazeBarSettings.header.region = {};
            if (WazeBarSettings.header.region[region] == null)
                WazeBarSettings.header.region[region] = {};
            if (this.checked) {
                WazeBarSettings.header.region[region].wiki = wiki;
                WazeBarSettings.header.region[region].abbr = abbr;
            } else {
                delete WazeBarSettings.header.region[region].wiki;
            }
        });

        LoadCustomLinks();
        // Load the current JSON settings into the Export Text Box
        serializeSettings()

        $("#WazeBarAddCustomLink").click(function () {
            if (
                $("#WazeBarCustomText").val() !== "" &&
                $("#WazeBarCustomURL").val() !== ""
            ) {
                var url = $("#WazeBarCustomURL").val();
                if (!(url.startsWith("http://") || url.startsWith("https://"))) {
                    url = "http://" + url;
                }
                WazeBarSettings.CustomLinks.push({
                    href: url,
                    text: $("#WazeBarCustomText").val(),
                });
                $("#WazeBarCustomURL").val("");
                $("#WazeBarCustomText").val("");
                LoadCustomLinks();
                SaveSettings();
                BuildWazebar();
            }
        });

        $("#WBSettingsCancel").click(function () {
            $("#WazeBarSettings").fadeOut();
        });

        $("#WBSettingsSave").click(function () {
            WazeBarSettings.DisplayWazeForum = isChecked("WazeForumSetting");
            WazeBarSettings.WMEBetaForum = isChecked("WMEBetaForumSetting");
            WazeBarSettings.scriptsForum = isChecked("ScriptsForum");
            WazeBarSettings.USSMForum = isChecked("USSMForumSetting");
            if (!forumPage)
                WazeBarSettings.USChampForum = isChecked("USChampForumSetting");
            WazeBarSettings.USWikiForum = isChecked("USWikiForumSetting");
            WazeBarSettings.ForumFontColor = $("#colorPickerForumFont").val();
            WazeBarSettings.WikiFontColor = $("#colorPickerWikiFont").val();
            WazeBarSettings.forumInterval = $("#forumInterval").val();
            WazeBarSettings.NAServerUpdate = isChecked("NAServerUpdateSetting");
            WazeBarSettings.ROWServerUpdate = isChecked("ROWServerUpdateSetting");
            WazeBarSettings.BarFontSize = $("#WazeBarFontSize").val();
            if ($("#WazeBarUnreadPopupDelay").val().trim() == "") {
                $("#WazeBarUnreadPopupDelay").val(0);
            }
            WazeBarSettings.UnreadPopupDelay = $("#WazeBarUnreadPopupDelay").val();
            if (WazeBarSettings.BarFontSize < 8) {
                WazeBarSettings.BarFontSize = 8;
                $("#WazeBarFontSize").val(8);
            }
            SaveSettings();
            BuildWazebar();
            injectCss()
            serializeSettings()

            $("#WazeBarSettings").fadeOut(); // hide settings dialog with fade animation
            $(".WazeBarText").css("font-size", $("#WazeBarFontSize").val() + "px");
        });

        $("#WBRegions").change(SelectedRegionChanged);

        $("#btnWazebarImportSettings").click(function () {
            if ($("#txtWazebarImportSettings").val() !== "") {
                localStorage.Wazebar_Settings = $("#txtWazebarImportSettings").val();
                LoadSettingsObj();
                LoadSettingsInterface();
                LoadCustomLinks();
                BuildWazebar();
            }
        });

        $("#btnWazebarCopySettings").click(function() {
            SaveSettings();
            serializeSettings();
            new Clipboard("#btnWazebarCopySettings");
        });


        // new Clipboard("#btnWazebarCopySettings");

        $("#WazeBarSettings").hide(); // Ensure the settings dialog is initially hidden
    }

    function SelectedRegionChanged() {
        setChecked("RegionForumSetting", false);
        setChecked("RegionWikiSetting", false);

        var selectedItem =
            $("#WBRegions")[0].options[$("#WBRegions")[0].selectedIndex];
        var region = selectedItem.value;
        var wiki = selectedItem.getAttribute("data-wiki");
        var forum = selectedItem.getAttribute("data-forum");

        if (!WazeBarSettings.header.region) WazeBarSettings.header.region = {};
        if (WazeBarSettings.header.region[region] == null)
            WazeBarSettings.header.region[region] = {};

        if (
            WazeBarSettings.header.region[region].forum &&
            WazeBarSettings.header.region[region].forum !== ""
        )
            setChecked("RegionForumSetting", true);
        if (
            WazeBarSettings.header.region[region].wiki &&
            WazeBarSettings.header.region[region].wiki !== ""
        )
            setChecked("RegionWikiSetting", true);

        BuildStatesDiv();
    }

    function BuildStatesDiv() {
        // Get the state list for this region
        var selectedItem =
            $("#WBRegions")[0].options[$("#WBRegions")[0].selectedIndex];
        var states = selectedItem.getAttribute("data-states").split(",");
        var forum = selectedItem.getAttribute("data-forum");
        var wiki = selectedItem.getAttribute("data-wiki");

        $("#WBStates").empty();

        var statesHTML = states
            .map(function (state) {
                var stateId = state.replace(" ", "_");
                return `
                <div class="state-row">
                    <span>${state}</span>
                    <input type='checkbox' id='${stateId}ForumSetting' />
                    <label for='${stateId}ForumSetting'>Forum</label>
                    <input type='checkbox' id='${stateId}WikiSetting' />
                    <label for='${state}WikiSetting'>Wiki</label>
                    <input type='checkbox' id='${stateId}UnlockSetting' />
                    <label for='${state}UnlockSetting'>Unlock</label>
                </div>
            `;
            })
            .join("");

        $("#WBStates").append(statesHTML);

        // Checking previously saved settings (if any) and setting checkboxes accordingly
        states.forEach(function (state) {
            var stateKey = state.replace(" ", "_");

            if (WazeBarSettings.header[state]) {
                if (
                    WazeBarSettings.header[state].forum &&
                    WazeBarSettings.header[state].forum !== ""
                ) {
                    setChecked(`${stateKey}ForumSetting`, true);
                }
                if (
                    WazeBarSettings.header[state].wiki &&
                    WazeBarSettings.header[state].wiki !== ""
                ) {
                    setChecked(`${stateKey}WikiSetting`, true);
                }
                if (
                    WazeBarSettings.header[state].unlock &&
                    WazeBarSettings.header[state].unlock !== ""
                ) {
                    setChecked(`${stateKey}UnlockSetting`, true);
                }
            }

            $(`#${stateKey}ForumSetting`).change(function () {
                var stateName = this.id.replace("ForumSetting", "").replace("_", " ");
                if (!WazeBarSettings.header[stateName])
                    WazeBarSettings.header[stateName] = {};
                if (this.checked) {
                    WazeBarSettings.header[stateName].forum = States[stateName].forum;
                    WazeBarSettings.header[stateName].abbr = States[stateName].abbr;
                } else {
                    delete WazeBarSettings.header[stateName].forum;
                }
                SaveSettings();
            });

            $(`#${stateKey}WikiSetting`).change(function () {
                var stateName = this.id.replace("WikiSetting", "").replace("_", " ");
                if (!WazeBarSettings.header[stateName])
                    WazeBarSettings.header[stateName] = {};
                if (this.checked) {
                    WazeBarSettings.header[stateName].wiki = States[stateName].wiki;
                    WazeBarSettings.header[stateName].abbr = States[stateName].abbr;
                } else {
                    delete WazeBarSettings.header[stateName].wiki;
                }
                SaveSettings();
            });

            $(`#${stateKey}UnlockSetting`).change(function () {
                var stateName = this.id.replace("UnlockSetting", "").replace("_", " ");
                if (!WazeBarSettings.header[stateName])
                    WazeBarSettings.header[stateName] = {};
                if (this.checked) {
                    WazeBarSettings.header[
                        stateName
                    ].unlock = `${location.origin}/forum/search.php?keywords=${stateName}&terms=all&author=&sv=0&fid%5B%5D=622&sc=1&sf=titleonly&sr=topics&sk=t&sd=d&st=0&ch=300&t=0&submit=Search`;
                    WazeBarSettings.header[stateName].abbr = States[stateName].abbr;
                } else {
                    delete WazeBarSettings.header[stateName].unlock;
                }
                SaveSettings();
            });
        });
    }

    function BuildRegionDropdown() {
        var $places = $("<div>");
        $places.html(
            [
                '<select id="WBRegions">',
                '<option value="Northwest" data-abbr="NWR" data-states="Alaska,Idaho,Montana,Washington,Oregon,Wyoming" data-forum="" data-wiki="https://www.waze.com/wiki/USA/USA/Northwest">Northwest</option>',
                '<option value="Southwest" data-abbr="SWR" data-states="Arizona,California,Colorado,Hawaii,Nevada,New Mexico,Utah" data-forum="" data-wiki="https://www.waze.com/wiki/USA/USA/Southwest">Southwest</option>',
                '<option value="Plains" data-abbr="PLN" data-states="Iowa,Kansas,Minnesota,Missouri,Nebraska,North Dakota,South Dakota" data-forum="" data-wiki="https://www.waze.com/wiki/USA/USA/Plains">Plains</option>',
                '<option value="South Central" data-abbr="SCR" data-states="Arkansas,Louisiana,Mississippi,Oklahoma,Texas" data-forum="" data-wiki="https://www.waze.com/wiki/USA/USA/South_Central">South Central</option>',
                '<option value="Great Lakes" data-abbr="GLR" data-states="Illinois,Indiana,Michigan,Ohio,Wisconsin" data-forum="" data-wiki="https://www.waze.com/wiki/USA/USA/Great_Lakes">Great Lakes</option>',
                '<option value="South Atlantic" data-abbr="SAT" data-states="Kentucky,North Carolina,South Carolina,Tennessee" data-forum="" data-wiki="https://www.waze.com/wiki/USA/USA/South_Atlantic">South Atlantic</option>',
                '<option value="Southeast" data-abbr="SER" data-states="Alabama,Florida,Georgia" data-forum="" data-wiki="https://www.waze.com/wiki/USA/USA/Southeast">Southeast</option>',
                '<option value="New England" data-abbr="NER" data-states="Connecticut,Maine,Massachusetts,New Hampshire,Rhode Island,Vermont" data-forum="" data-wiki="https://www.waze.com/wiki/USA/USA/New_England">New England</option>',
                '<option value="Northeast" data-abbr="NOR" data-states="Delaware,New Jersey,New York,Pennsylvania" data-forum="" data-wiki="https://www.waze.com/wiki/USA/USA/Northeast">Northeast</option>',
                '<option value="Mid Atlantic" data-abbr="MAR" data-states="District of Columbia,Maryland,Virginia,West Virginia" data-forum="" data-wiki="https://www.waze.com/wiki/USA/USA/Mid_Atlantic">Mid Atlantic</option>',
                '<option value="Territories" data-abbr="ATR" data-states="Puerto Rico,US Virgin Islands,South Pacific Territories" data-forum="" data-wiki="https://www.waze.com/wiki/USA/USA/Territories">Territories</option>',
            ].join(" ")
        );

        return $places.html();
    }

    function LoadStatesObj() {
        States.Alabama = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/alabama/4839",
            wiki: "https://www.waze.com/wiki/USA/Southeast",
            abbr: "AL",
        };
        States.Alaska = {
            forum: "https://www.waze.com/discuss/c/editors/united-states/alaska/4840",
            wiki: "https://www.waze.com/wiki/USA/Alaska",
            abbr: "AK",
        };
        States.Arizona = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/arizona/4841",
            wiki: "https://www.waze.com/wiki/USA/Arizona",
            abbr: "AZ",
        };
        States.Arkansas = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/arkansas/4842",
            wiki: "https://www.waze.com/wiki/USA/Arkansas",
            abbr: "AR",
        };
        States.California = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/california/4843",
            wiki: "https://www.waze.com/wiki/USA/California",
            abbr: "CA",
        };
        States.Colorado = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/colorado/4844",
            wiki: "https://www.waze.com/wiki/USA/Colorado",
            abbr: "CO",
        };
        States.Connecticut = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/connecticut/4845",
            wiki: "https://www.waze.com/wiki/USA/Connecticut",
            abbr: "CT",
        };
        States.Delaware = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/delaware/4846",
            wiki: "https://www.waze.com/wiki/USA/Delaware",
            abbr: "DE",
        };
        States["District of Columbia"] = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/district-of-columbia/4847",
            wiki: "https://www.waze.com/wiki/USA/District_of_Columbia",
            abbr: "DC",
        };
        States.Florida = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/florida/4848",
            wiki: "https://www.waze.com/wiki/USA/Southeast",
            abbr: "FL",
        };
        States.Georgia = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/georgia/4849",
            wiki: "https://www.waze.com/wiki/USA/Southeast",
            abbr: "GA",
        };
        States.Hawaii = {
            forum: "https://www.waze.com/discuss/c/editors/united-states/hawaii/4850",
            wiki: "https://www.waze.com/wiki/USA/Hawaii",
            abbr: "HI",
        };
        States.Idaho = {
            forum: "https://www.waze.com/discuss/c/editors/united-states/idaho/4851",
            wiki: "https://www.waze.com/wiki/USA/Idaho",
            abbr: "ID",
        };
        States.Illinois = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/illinois/4852",
            wiki: "https://www.waze.com/wiki/USA/Illinois",
            abbr: "IL",
        };
        States.Indiana = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/indiana/4853",
            wiki: "https://www.waze.com/wiki/USA/Indiana",
            abbr: "IN",
        };
        States.Iowa = {
            forum: "https://www.waze.com/discuss/c/editors/united-states/iowa/4854",
            wiki: "https://www.waze.com/wiki/USA/Iowa",
            abbr: "IA",
        };
        States.Kansas = {
            forum: "https://www.waze.com/discuss/c/editors/united-states/kansas/4855",
            wiki: "https://www.waze.com/wiki/USA/Kansas",
            abbr: "KS",
        };
        States.Kentucky = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/kentucky/4856",
            wiki: "https://www.waze.com/wiki/USA/Kentucky",
            abbr: "KY",
        };
        States.Louisiana = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/louisiana/4857",
            wiki: "https://www.waze.com/wiki/USA/Louisiana",
            abbr: "LA",
        };
        States.Maine = {
            forum: "https://www.waze.com/discuss/c/editors/united-states/maine/4858",
            wiki: "https://www.waze.com/wiki/USA/Maine",
            abbr: "ME",
        };
        States.Maryland = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/maryland/4859",
            wiki: "https://www.waze.com/wiki/USA/Maryland",
            abbr: "MD",
        };
        States.Massachusetts = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/massachusetts/4860",
            wiki: "https://www.waze.com/wiki/USA/Massachusetts",
            abbr: "MA",
        };
        States.Michigan = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/michigan/4861",
            wiki: "https://www.waze.com/wiki/USA/Michigan",
            abbr: "MI",
        };
        States.Minnesota = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/minnesota/4862",
            wiki: "https://www.waze.com/wiki/USA/Minnesota",
            abbr: "MN",
        };
        States.Mississippi = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/mississippi/4863",
            wiki: "https://www.waze.com/wiki/USA/Mississippi",
            abbr: "MS",
        };
        States.Missouri = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/missouri/4864",
            wiki: "https://www.waze.com/wiki/USA/Missouri",
            abbr: "MO",
        };
        States.Montana = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/montana/4865",
            wiki: "https://www.waze.com/wiki/USA/Montana",
            abbr: "MT",
        };
        States.Nebraska = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/nebraska/4866",
            wiki: "https://www.waze.com/wiki/USA/Nebraska",
            abbr: "NE",
        };
        States.Nevada = {
            forum: "https://www.waze.com/discuss/c/editors/united-states/nevada/4867",
            wiki: "https://www.waze.com/wiki/USA/Nevada",
            abbr: "NV",
        };
        States["New Hampshire"] = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/New-Hampshire/4868",
            wiki: "https://www.waze.com/wiki/USA/New_Hampshire",
            abbr: "NH",
        };
        States["New Jersey"] = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/new-jersey/4869",
            wiki: "https://www.waze.com/wiki/USA/New_Jersey",
            abbr: "NJ",
        };
        States["New Mexico"] = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/new-mexico/4870",
            wiki: "https://www.waze.com/wiki/USA/New_Mexico",
            abbr: "NM",
        };
        States["New York"] = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/new-york/4871",
            wiki: "hhttps://www.waze.com/wiki/USA/New_York",
            abbr: "NY",
        };
        States["North Carolina"] = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/north-carolina/4872",
            wiki: "https://www.waze.com/wiki/USA/North_Carolina",
            abbr: "NC",
        };
        States["North Dakota"] = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/north-dakota/4873",
            wiki: "https://www.waze.com/wiki/USA/North_Dakota",
            abbr: "ND",
        };
        States.Ohio = {
            forum: "https://www.waze.com/discuss/c/editors/united-states/ohio/4874",
            wiki: "https://www.waze.com/wiki/USA/Ohio",
            abbr: "OH",
        };
        States.Oklahoma = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/oklahoma/4875",
            wiki: "hhttps://www.waze.com/wiki/USA/Oklahoma",
            abbr: "OK",
        };
        States.Oregon = {
            forum: "https://www.waze.com/discuss/c/editors/united-states/oregon/4876",
            wiki: "https://www.waze.com/wiki/USA/Oregon",
            abbr: "OR",
        };
        States.Pennsylvania = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/pennsylvania/4877",
            wiki: "https://www.waze.com/wiki/USA/Pennsylvania",
            abbr: "PA",
        };
        States["Rhode Island"] = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/rhode-island/4880",
            wiki: "https://www.waze.com/wiki/USA/Rhode_Island",
            abbr: "RI",
        };
        States["South Carolina"] = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/south-carolina/4881",
            wiki: "https://www.waze.com/wiki/USA/South_Carolina",
            abbr: "SC",
        };
        States["South Dakota"] = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/south-dakota/4882",
            wiki: "https://www.waze.com/wiki/USA/South_Dakota",
            abbr: "SD",
        };
        States.Tennessee = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/tennessee/4884",
            wiki: "hhttps://www.waze.com/wiki/USA/Tennessee",
            abbr: "TN",
        };
        States.Texas = {
            forum: "https://www.waze.com/discuss/c/editors/united-states/texas/4885",
            wiki: "https://www.waze.com/wiki/USA/Texas",
            abbr: "TX",
        };
        States.Utah = {
            forum: "https://www.waze.com/discuss/c/editors/united-states/utah/4895",
            wiki: "https://www.waze.com/wiki/USA/Utah",
            abbr: "UT",
        };
        States.Vermont = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/vermont/4896",
            wiki: "https://www.waze.com/wiki/USA/Vermont",
            abbr: "VT",
        };
        States.Virginia = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/virginia/4897",
            wiki: "https://www.waze.com/wiki/USA/Virginia",
            abbr: "VA",
        };
        States.Washington = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/washington/4898",
            wiki: "hhttps://www.waze.com/wiki/USA/Washington",
            abbr: "WA",
        };
        States["West Virginia"] = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/west-virginia/4899",
            wiki: "https://www.waze.com/wiki/USA/West_Virginia",
            abbr: "WV",
        };
        States.Wisconsin = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/wisconsin/4900",
            wiki: "https://www.waze.com/wiki/USA/Wisconsin",
            abbr: "WI",
        };
        States.Wyoming = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/wyoming/4901",
            wiki: "https://www.waze.com/wiki/USA/Wyoming",
            abbr: "WY",
        };
        States["Puerto Rico"] = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/puerto-rico/4879",
            wiki: "https://www.waze.com/wiki/USA/Puerto_Rico",
            abbr: "PR",
        };
        States["US Virgin Islands"] = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/us-virgin-islands/4892",
            wiki: "https://www.waze.com/wiki/USA/Virgin_Islands",
            abbr: "",
        };
        States["South Pacific Territories"] = {
            forum:
                "https://www.waze.com/discuss/c/editors/united-states/south-pacific-territories/4883",
            wiki: "",
            abbr: "",
        };
    }

    function injectCss() {
        var css = [
            // General text styling for WazeBar elements
            ".WazeBarText { display: inline; padding-right: 5px; margin-right: 5px; border-right: thin solid grey; font-size: " + WazeBarSettings.BarFontSize + "px; }",
            ".WazeBarIcon { display: inline; margin-left: 3px; cursor: pointer; }",

            // WazeBar styling
            // WazeBar Favorites dropdown styling
            "#WazeBarFavorites { max-height: 300px; z-index: 100; overflow: auto; display: none; position: absolute; background-color: #f9f9f9; min-width: 200px; box-shadow: 0px 8px 16px 0px rgba(0, 0, 0, 0.2); margin-top: -2px; padding: 10px; }",
            "#WazeBarFavoritesList { list-style: none; padding: 0; margin: 0; }",
            ".favorite-item { position: relative; padding: 8px 12px; margin: 4px 0; background: #f1f1f1; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; }",
            ".favorite-item a { flex-grow: 1; text-decoration: none; color: #333; }",
            ".favorite-item i { cursor: pointer; color: #c00; }",
            ".favorite-item:hover { background: #e1e1e1; }",
            "#WazeBarFavoritesAddContainer { display: flex; flex-direction: column; margin-top: 10px; gap: 8px; }",
            "#WazeBarFavoritesAddContainer input { height: 20px; border: 1px solid #000000; padding: 4px; border-radius: 4px; }",
            "#WazeBarAddFavorite { padding: 8px 12px; font-size: 1rem; background-color: #8BC34A; color: white; border: 2px solid #8BC34A; border-radius: 5px; cursor: pointer; box-sizing: border-box; transition: background-color 0.3s ease, border-color 0.3s ease; }",
            "#WazeBarAddFavorite:hover { background-color: #689F38; border-color: #689F38; }",

            // WazeBar Forum / Wiki / Current State Forum & Wiki links styling
            ".WazeBarText.WazeBarWikiItem a { color: " + WazeBarSettings.WikiFontColor + "; }",
            ".WazeBarText.WazeBarForumItem a { color: " + WazeBarSettings.ForumFontColor + "; }",
            ".WazeBarText.WazeBarCurrState a { color: #FF0000; }",

            // Settings menu styling
            // Flex container styling
            ".flex-container { display: flex; align-items: start; }",
            ".flex-column { padding: 10px; position: relative; flex: 1; }",
            ".right-column::after { content: ''; position: absolute; top: 0; right: 0; width: 1px; height: 100%; background-color: #ccc; }",
            ".right-column { padding-right: 5px; }",
            ".left-column { padding-left: 5px; }",

            "#WazeBarSettings { display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 90%; max-width: 700px; background-color: #fff; border: 3px solid #000; border-radius: 10px; padding: 16px; box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2); }",
            "#WazeBarSettings input[type='number'], #WazeBarSettings input[type='text'], #WazeBarSettings textarea { border: 1px solid #000; padding: 8px; border-radius: 4px; margin-bottom: 5px; width: calc(100% - 16px); }",
            "#WazeBarSettings button { padding: 8px 12px; border: none; border-radius: 4px; cursor: pointer; }",
            "#WazeBarSettings button#WBSettingsSave { background-color: #007bff; color: #fff; }",
            "#WazeBarSettings button#WBSettingsSave:hover { background-color: #0056b3; }",
            "#WazeBarSettings button#WBSettingsCancel { background-color: #6c757d; color: #fff; }",
            "#WazeBarSettings button#WBSettingsCancel:hover { background-color: #5a6268; }",
            "#WazeBarSettings h4 { margin-top: 5px; margin-bottom: 5px; font-size: 16px; line-height: 1.2; }",
            "#WazeBarSettings #customLinksSection { margin-top: 5px; }",
            "#WazeBarSettings #customLinksSection div { margin-bottom: 0; }",
            "#WazeBarSettings label { display: block; margin-bottom: 5px; }",

            // Color Picker styling
            "#colorPickerForumFont, #colorPickerWikiFont { display: inline-block; width: 60px; height: 40px; border: 1px solid #000000; padding: 3px; border-radius: 4px; }",

            // Unread messages popup styling
            ".WazeBarUnread { position: absolute; background: white; border: 1px solid rgba(0, 0, 0, 0.2); padding: 10px; box-shadow: 0px 8px 16px rgba(0, 0, 0, 0.2); z-index: 100; }",
            ".WazeBarUnreadList { max-height: 150px; overflow-y: auto; }",

            // State rows styling
            ".state-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }",
            ".state-row span { width: 100px; }",

            // Horizontal rule styling
            "hr { border: none; border-top: 1px solid #ccc; margin: 10px 0 0 0; width: calc(100% - 16px); }", // Removed bottom margin for hr

            // Inline element alignment for the settings inputs
            "#WazeBarSettings .flex-row { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }",

            // Additional styles for Custom Links section inputs to match Favorites section inputs
            "#WazeBarCustomURL, #WazeBarCustomText { height: 30px; border: 1px solid #000000; padding: 4px; border-radius: 4px; margin-bottom: 5px; }",

            // Button styling for Add Custom Link button to match Add Favorite button
            "#WazeBarAddCustomLink { padding: 8px 0; font-size: 1rem; background-color: #8BC34A; color: white; border: 2px solid #8BC34A; border-radius: 5px; cursor: pointer; box-sizing: border-box; transition: background-color 0.3s ease, border-color 0.3s ease; width: calc(100% - 16px); margin: 0; }",
            "#WazeBarAddCustomLink:hover { background-color: #689F38; border-color: #689F38; }",

            // Custom List styling to match the Favorites styling
            "#WazeBarCustomLinksList { list-style: none; padding: 0; margin: 0; font-family: Arial, sans-serif; }",
            ".custom-item { position: relative; padding: 6px 10px; margin: 8px 0; background: linear-gradient(to right, #f9f9f9, #eaeaea); border-radius: 10px; display: flex; justify-content: space-between; align-items: center; width: calc(100% - 16px); box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1); transition: background 0.3s ease, transform 0.3s ease; border: 1px solid #ddd; }",
            ".custom-item a { flex-grow: 1; text-decoration: none; color: #555; font-weight: 500; }",
            ".custom-item i { cursor: pointer; color: #f56a6a; transition: color 0.3s ease; }",
            ".custom-item:hover { background: #f0f0f0; transform: translateY(-2px); }",
            ".custom-item i:hover { color: #e84141; }",

            // Export/Import Section Styling
            "#exportImportSection h4 { margin-bottom: 10px; font-size: 18px; }",
            ".flex-row { display: flex; align-items: center; gap: 10px; margin-bottom: 15px; }",
            ".export-button, .import-button { font-size: 1.5rem; padding: 10px; background-color: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; transition: background-color 0.3s ease, transform 0.3s ease; }",
            ".export-button:hover, .import-button:hover { background-color: #0056b3; transform: scale(1.05); }",
            "#txtWazebarSettings, #txtWazebarImportSettings { width: 300px; height: auto; padding: 10px; border: 1px solid #ddd; border-radius: 5px; font-size: 14px; box-sizing: border-box; resize: vertical; }",

            // Ensure textareas align properly in flex container
            ".flex-row textarea { flex-grow: 0; }",

            // Adjust button font sizes for better alignment
            ".fa-upload, .fa-download { font-size: 1.2rem; padding: 10px; }"
        ].join(" ");

        // Remove the previous styles if they exist
        $("#WazeBarStyles").remove();

        // Append the new styles
        $('<style type="text/css" id="WazeBarStyles">' + css + '</style>').appendTo("head");
    }
    // Call the function to inject the CSS
    injectCss();

    function isChecked(checkboxId) {
        return $("#" + checkboxId).is(":checked");
    }

    function setChecked(checkboxId, checked) {
        $("#" + checkboxId).prop("checked", checked);
    }

    function LoadSettingsObj() {
        var loadedSettings;
        try {
            loadedSettings = $.parseJSON(localStorage.getItem("Wazebar_Settings"));
        } catch (err) {
            loadedSettings = null;
        }

        var defaultSettings = {
            forumInterval: 2,
            scriptsForum: false,
            header: { region: {} },
            USSMForum: false,
            USChampForum: false,
            USWikiForum: false,
            NAServerUpdate: true,
            WMEBetaForum: false,
            DisplayWazeForum: false,
            Favorites: [
                {
                    href: "https://wazeopedia.waze.com/wiki/USA/Waze_Map_Editor/Welcome",
                    text: "Map Editor Welcome",
                },
                {
                    href: "https://wazeopedia.waze.com/wiki/USA/Waze_etiquette",
                    text: "Etiquette",
                },
                {
                    href: "https://wazeopedia.waze.com/wiki/USA/Glossary",
                    text: "Glossary",
                },
            ],
            ForumFontColor: "#1E90FF",
            WikiFontColor: "#32CD32",
            BarFontSize: 13,
            CustomLinks: [],
            UnreadPopupDelay: 0,
            ROWServerUpdate: false,
        };
        WazeBarSettings = loadedSettings ? loadedSettings : defaultSettings;
        for (var prop in defaultSettings) {
            if (!WazeBarSettings.hasOwnProperty(prop))
                WazeBarSettings[prop] = defaultSettings[prop];
        }
    }

    function serializeSettings() {
        SaveSettings();  // Save current settings to localStorage
        const settings = JSON.parse(localStorage.getItem('Wazebar_Settings')) || {};
        const serialized = JSON.stringify(settings, null, 4);  // Pretty print JSON with 4 spaces indentation
        
        // Update #txtWazebarSettings with the serialized settings
        $("#txtWazebarSettings").text(serialized);
        
        return serialized;
    }

    function SaveSettings() {
        if (localStorage) {
            var localsettings = {
                forumInterval: WazeBarSettings.forumInterval,
                scriptsForum: WazeBarSettings.scriptsForum,
                header: WazeBarSettings.header,
                USSMForum: WazeBarSettings.USSMForum,
                USChampForum: WazeBarSettings.USChampForum,
                USWikiForum: WazeBarSettings.USWikiForum,
                NAServerUpdate: WazeBarSettings.NAServerUpdate,
                WMEBetaForum: WazeBarSettings.WMEBetaForum,
                Favorites: WazeBarSettings.Favorites,
                DisplayWazeForum: WazeBarSettings.DisplayWazeForum,
                ForumFontColor: WazeBarSettings.ForumFontColor,
                WikiFontColor: WazeBarSettings.WikiFontColor,
                BarFontSize: WazeBarSettings.BarFontSize,
                CustomLinks: WazeBarSettings.CustomLinks,
                UnreadPopupDelay: WazeBarSettings.UnreadPopupDelay,
                ROWServerUpdate: WazeBarSettings.ROWServerUpdate,
            };
            localStorage.setItem("Wazebar_Settings", JSON.stringify(localsettings));
        }
    }
})();