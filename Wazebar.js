// ==UserScript==
// @name         WME Wazebar
// @namespace    https://greasyfork.org/users/30701-justins83-waze
// @version      2024.10.04.24
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
// @downloadURL http://localhost:8080/Wazebar.js
// @updateURL http://localhost:8080/Wazebar.js
// ==/UserScript==

/*  --------  Add these back before and remove  require http://localhost:8080/Wazebar.js before Submit! -----------
#require      http://localhost:8080/Wazebar.js    # Local server URL
#updateURL    http://localhost:8080/Wazebar.js    # Local server URL
#downloadURL  http://localhost:8080/Wazebar.js    # Local server URL

contributionURL https://github.com/WazeDev/Thank-The-Authors
downloadURL https://update.greasyfork.org/scripts/27604/WME%20Wazebar.user.js
updateURL https://update.greasyfork.org/scripts/27604/WME%20Wazebar.meta.js
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
        $Wazebar.html([
            '<div class="WazeBarIcon" id="WazeBarSettingsButton"><i class="fa fa-cog" aria-hidden="true"></i></div>',
            '<div class="WazeBarIcon" id="WazeBarRefreshButton"><i class="fa fa-refresh" aria-hidden="true"></i></div>',
            '<div class="WazeBarIcon" id="WazeBarFavoritesIcon"><i class="fa fa-star" aria-hidden="true"></i>',
            '<div id="WazeBarFavorites">',
            '<ul id="WazeBarFavoritesList"></ul>',
            '<div id="WazeBarFavoritesAddContainer">',
            '<input type="text" id="WazeBarURL" placeholder="URL">',
            '<input type="text" id="WazeBarText" placeholder="Label">',
            '<button id="WazeBarAddFavorite">Add</button>',
            '</div>',
            '</div>',
            '</div>',
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
        ].join(" "));
    
        if (forumPage) {
            $(".main_content").prepend($Wazebar);
            $("#Wazebar").css({
                "z-index": "9999999",
                "margin-left": "20px",
                "background-color": "white",
                "width": "100%",
                "top": "0"
            });
        } else {
            $(".app.container-fluid.show-sidebar").before($Wazebar);
        }
    
        checkForums();
        StartIntervals();
    
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
            }
        });

        $("#WazeBarFavoritesIcon").mouseleave(function () {
            $("#WazeBarFavorites").css({ display: "none" });
        });

        $("#WazeBarFavoritesIcon").mouseenter(function () {
            $("#WazeBarFavorites").css({ display: "block" });
        });

        LoadFavorites();

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

        $("#WazeBarSettingsButton").click(function () {
            $("#WazeBarSettings").css({ visibility: "visible" });
            LoadSettingsInterface();
        });

        $("#WazeBarRefreshButton").click(function () {
            $("#WazeBarRefreshButton i").addClass("fa-spin");
            //window.clearInterval(inboxInterval); // only used for Inbox is no longer needed with /discuss platform
            window.clearInterval(forumInterval);
            //GetPMCount(); // only used for Inbox is no longer needed with /discuss platform
            checkForums();
            StartIntervals();
            $("#WazeBarRefreshButton i").removeClass("fa-spin");
        });

        $("body > div.app.container-fluid.show-sidebar").css(
            "height",
            "calc(100vh - " + $("#Wazebar").height() + "px)"
        );
        window.dispatchEvent(new Event("resize")); //otherwise the WME editing area shifts up under Wazebar
        if (forumPage) {
            $(".navigation").css("top", $("#Wazebar").height() + "px");
        }
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
        //$('#inboxInterval')[0].value = WazeBarSettings.inboxInterval;// only used for Inbox is no longer needed with /discuss platform
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
        favoritesList.on('click', '.fa-times', function() {
            const index = $(this).data('index');
            WazeBarSettings.Favorites.splice(index, 1);
            SaveSettings();
            LoadFavorites(); // Reload the updated favorites list
        });
    }

    function LoadCustomLinks() {
        $("#WazeBarCustomLinksList").empty();
        var links = "";
        for (var i = 0; i < WazeBarSettings.CustomLinks.length; i++) {
            links +=
                '<div style="position:relative;"><a href="' +
                WazeBarSettings.CustomLinks[i].href +
                '" target="_blank">' +
                WazeBarSettings.CustomLinks[i].text.replace(/\s/g, "") +
                '</a><i id="WazeBarCustomLinksListClose' +
                i +
                '" style="position:absolute; right:0; top:0;" class="fa fa-times" title="Remove custom link"></i></div>';
        }

        $("#WazeBarCustomLinksList").prepend(links);

        $('[id^="WazeBarCustomLinksListClose"]').click(function () {
            WazeBarSettings.CustomLinks.splice(
                Number(this.id.replace("WazeBarCustomLinksListClose", "")),
                1
            );
            SaveSettings();
            LoadCustomLinks();
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

    /* GetPMCount(); // only used for Inbox is no longer needed with /discuss platform
      function GetPMCount() {
          $.get(location.origin + '/forum/ucp.php?i=pm&folder=inbox', function (Inbox) {
              let search = Inbox.match(/Inbox\s*\((\d+)\)/);
              //Inbox.match(/Inbox\s*\((\d+)\)/)[1];
              if (search) {
                  let count = search[1];
                  $('#PMCount').remove();
                  $('#Inbox a').append("<span style='color:red;font-weight:bold;' id='PMCount'> (" + count + ")</span>");
              }
              else
                  $('#PMCount').remove();
          });
      }
     */

    function checkForums() {
        if (WazeBarSettings.WMEBetaForum)
            checkUnreadTopics(
                location.origin + "/forum/viewforum.php?f=211",
                "WMEBetaForum",
                "WMEBetaForumCount"
            );
        if (WazeBarSettings.scriptsForum)
            checkUnreadTopics(
                location.origin + "/discuss/c/editors/addons-extensions-and-scripts/3984",
                "Scripts",
                "ScriptsCount"
            ); //Scripts
        if (WazeBarSettings.USSMForum)
            checkUnreadTopics(
                location.origin + "/discuss/c/editors/united-states/us-state-managers/4890",
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
                location.origin + "/discuss/c/editors/united-states/us-wiki-discussion/4894",
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
        var $section = $("<div>", {
            style: "padding:8px 16px",
            id: "WazeBarSettings",
        });
        $section.html(
            [
                '<div id="WazeBarSettings" style="visibility:hidden; position:fixed; top:20%; left:40%; width:700px; min-height:150px; z-index:1000; background-color:white; border-width:3px; border-style:solid; border-radius:10px; padding:4px;">',
                "<div>",
                '<div style="float: left; margin-right: 2px;">',
                'Font size <input style="width: 50px;" min="8" type="number" id="WazeBarFontSize"/> px <br/><br/> ',
                `Forum font color <button id="colorPickerForumFont" style="width: 15px; height: 15px; border: 2px solid black; background-color:${WazeBarSettings.ForumFontColor}"></button><br/><br/>`,
                `Wiki font color <button id="colorPickerWikiFont" style="width: 15px; height: 15px; border: 2px solid black; background-color:${WazeBarSettings.WikiFontColor}"></button><br/><br/>`,
                'Unread popup delay <input style="width: 40px;" min="0" type="text" id="WazeBarUnreadPopupDelay"/> s',
                "<h4>Export/Import</h4>",
                "<div>",
                '<button class="fa fa-upload fa-2x" aria-hidden="true" id="btnWazebarCopySettings" style="cursor:pointer;border: 1; background: none; box-shadow:none;" title="Copy Wazebar settings to the clipboard" data-clipboard-target="#txtWazebarSettings"></button>',
                '<textarea rows="4" cols="15" readonly id="txtWazebarSettings" style="resize:none;"></textarea>',
                "</div>", //end export div
                "<div>",
                '<button class="fa fa-download fa-2x" aria-hidden="true" id="btnWazebarImportSettings" style="cursor:pointer;border: 1; background: none; box-shadow:none;" title="Import copied settings"></button>',
                '<textarea rows="4" cols="15" id="txtWazebarImportSettings" style="resize:none;"></textarea>',
                "</div>", //end import div
                "</div>",
                "<div>",
                '<div id="WBDisplayOptions" style="float: left;border-right: thin solid grey; padding-right:5px; border-left: thin solid grey; padding-left:5px;">',
                '<input type="checkbox" id="WazeForumSetting" /><label for="WazeForumSetting">Display on Forum pages</label></br>',
                '<div style="margin-left:5px;">',
                //'Inbox check frequency <input type="number" id="inboxInterval" min="1" style="width:50px;"> mins</br>',// only used for Inbox is no longer needed with /discuss platform
                'Forum check frequency <input type="number" id="forumInterval" min="1" style="width:50px;"> mins</br>',
                '<input type="checkbox" id="WMEBetaForumSetting" /><label for="WMEBetaForumSetting">WME Beta Forum</label></br>',
                '<input type="checkbox" id="ScriptsForum" /><label for="ScriptsForum">Scripts Forum</label></br>',
                '<input type="checkbox" id="USSMForumSetting" /><label for="USSMForumSetting">US SM Forum</label></br>',
                !forumPage && W.loginManager.user.rank >= 5
                    ? '<input type="checkbox" id="USChampForumSetting" /><label for="USChampForumSetting">US Champ Forum</label></br>'
                    : "",
                '<input type="checkbox" id="USWikiForumSetting" /><label for="USWikiForumSetting">US Wiki Forum</label></br>',
                '<input type="checkbox" id="NAServerUpdateSetting" /><label for="NAServerUpdateSetting">NA Server Update</label></br>',
                '<input type="checkbox" id="ROWServerUpdateSetting" /><label for="ROWServerUpdateSetting">ROW Server Update</label></br>',
                ,
                "Region " +
                BuildRegionDropdown() +
                '<input type="checkbox" id="RegionForumSetting"/><label for="RegionForumSetting">Forum</label> <input type="checkbox" id="RegionWikiSetting"/><label for="RegionWikiSetting">Wiki</label>',
                '<div id="WBStates"></div>',
                "</div>", //close region div
                "</div>",

                '<div style="float: right;">',
                "<h4>Custom Links</h2><br />",
                '<div id="WazeBarCustomLinks">',
                '<div id="WazeBarCustomLinksList" style="max-height:250px; overflow: auto;"></div>',
                '<div><div style="float:left;">', //textboxes div
                '<label for="WazeBarCustomURL" style="display:inline-block; width:40px;">URL </label><input type="text" id="WazeBarCustomURL" size="10" style="border: 1px solid #000000; height:20px;"/></br>',
                '<label for="WazeBarCustomText" style="display:inline-block; width:40px;">Text </label><input type="text" id="WazeBarCustomText" size="10" style="border: 1px solid #000000; height:20px;"/>',
                "</div>", //End textboxes div
                '<div style="float:right; text-align:center;">', //button div
                '<button id="WazeBarAddCustomLink">Add</button>',
                "</div>", //End button div
                "</div></div></div>",

                "</div></div>",

                '<div style="clear: both; padding-top:5px;">',
                '<div style="position: relative; float:left; display: inline-block"><a href="' +
                location.origin +
                '/forum/viewtopic.php?f=819&t=219816" target="_blank">Forum thread</a></div>',
                '<div style="position: relative; float: right; display: inline-block">', //save/cancel buttons
                '<button id="WBSettingsSave" style="width: 85px;" class="btn btn-primary">Save</button>',
                '<button id="WBSettingsCancel" class="btn btn-default">Cancel</button>',
                "</div>", //end save/cancel buttons
                "</div>",
            ].join(" ")
        );

        if (forumPage) $("body").append($section.html());
        else $("#WazeMap").append($section.html());

        $("#WazeBarUnreadPopupDelay").keypress(function (event) {
            if (
                !(
                    (event.which >= 48 && event.which <= 57) ||
                    (event.which == 46 && (this.value.match(/\./g) || []).length == 0)
                )
            )
                event.preventDefault();
        });

        //Region forum checkbox toggled
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
            } else delete WazeBarSettings.header.region[region].forum;
        });

        //Region wiki checkbox toggled
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
            } else delete WazeBarSettings.header.region[region].wiki;
        });

        LoadCustomLinks();

        $("#WazeBarAddCustomLink").click(function () {
            if (
                $("#WazeBarCustomText").val() !== "" &&
                $("#WazeBarCustomURL").val() !== ""
            ) {
                var url = $("#WazeBarCustomURL").val();
                if (!(url.startsWith("http://") || url.startsWith("https://")))
                    url = "http://" + url;
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

        //Cancel button clicked
        $("#WBSettingsCancel").click(function () {
            $("#WazeBarSettings").css({ visibility: "hidden" }); //hide the settings window
        });

        //Save button clicked
        $("#WBSettingsSave").click(function () {
            WazeBarSettings.DisplayWazeForum = isChecked("WazeForumSetting");
            WazeBarSettings.WMEBetaForum = isChecked("WMEBetaForumSetting");
            WazeBarSettings.scriptsForum = isChecked("ScriptsForum");
            WazeBarSettings.USSMForum = isChecked("USSMForumSetting");
            if (!forumPage)
                WazeBarSettings.USChampForum = isChecked("USChampForumSetting");
            WazeBarSettings.USWikiForum = isChecked("USWikiForumSetting");
            //WazeBarSettings.inboxInterval = $('#inboxInterval')[0].value;// only used for Inbox is no longer needed with /discuss platform
            WazeBarSettings.forumInterval = $("#forumInterval")[0].value;
            WazeBarSettings.NAServerUpdate = isChecked("NAServerUpdateSetting");
            WazeBarSettings.ROWServerUpdate = isChecked("ROWServerUpdateSetting");
            WazeBarSettings.BarFontSize = $("#WazeBarFontSize")[0].value;
            if ($("#WazeBarUnreadPopupDelay")[0].value.trim() == "")
                $("#WazeBarUnreadPopupDelay")[0].value = 0;
            WazeBarSettings.UnreadPopupDelay = $("#WazeBarUnreadPopupDelay")[0].value;
            if (WazeBarSettings.BarFontSize < 8) {
                WazeBarSettings.BarFontSize = 8;
                $("#WazeBarFontSize")[0].value = 8;
            }
            SaveSettings();

            BuildWazebar();
            $("#txtWazebarSettings")[0].innerHTML = localStorage.Wazebar_Settings;
            $("#WazeBarSettings").css({ visibility: "hidden" }); //hide the settings window
            //Update the forum and wiki entries with the newly selected colors
            $(".WazeBarText").css("font-size", $("#WazeBarFontSize")[0].value + "px");
        });

        //When they change the selected region, build a new state div.
        $("#WBRegions").change(SelectedRegionChanged);

        $("#btnWazebarImportSettings").click(function () {
            if ($("#txtWazebarImportSettings")[0].value !== "") {
                localStorage.Wazebar_Settings = $("#txtWazebarImportSettings")[0].value;
                LoadSettingsObj();
                LoadSettingsInterface();
                LoadCustomLinks();
                BuildWazebar();
            }
        });
        new Clipboard("#btnWazebarCopySettings");
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
        //Get the state list for this region
        var selectedItem =
            $("#WBRegions")[0].options[$("#WBRegions")[0].selectedIndex];
        var states = selectedItem.getAttribute("data-states").split(",");
        var forum = selectedItem.getAttribute("data-forum");
        var wiki = selectedItem.getAttribute("data-wiki");

        var statesHTML = "";
        $("#WBStates").empty();

        for (var i = 0; i < states.length; i++) {
            statesHTML =
                states[i] +
                " <input type='checkbox' id='" +
                states[i].replace(" ", "_") +
                "ForumSetting'/><label for='" +
                states[i].replace(" ", "_") +
                "ForumSetting'>Forum</label> <input type='checkbox' id='" +
                states[i].replace(" ", "_") +
                "WikiSetting'/><label for='" +
                states[i] +
                "WikiSetting'>Wiki</label> <input type='checkbox' id='" +
                states[i].replace(" ", "_") +
                "UnlockSetting'/><label for='" +
                states[i] +
                "UnlockSetting'>Unlock</label></br>";
            $("#WBStates").append(statesHTML);
            //Check the forum/wiki/unlock checkboxes if it has been saved
            if (WazeBarSettings.header[states[i]]) {
                if (
                    WazeBarSettings.header[states[i]].forum &&
                    WazeBarSettings.header[states[i]].forum !== ""
                )
                    setChecked(states[i].replace(" ", "_") + "ForumSetting", true);
                if (
                    WazeBarSettings.header[states[i]].wiki &&
                    WazeBarSettings.header[states[i]].wiki !== ""
                )
                    setChecked(states[i].replace(" ", "_") + "WikiSetting", true);
                if (
                    WazeBarSettings.header[states[i]].unlock &&
                    WazeBarSettings.header[states[i]].unlock !== ""
                )
                    setChecked(states[i].replace(" ", "_") + "UnlockSetting", true);
            }

            $("#" + states[i].replace(" ", "_") + "ForumSetting").change(function () {
                var state = this.id.replace("ForumSetting", "").replace("_", " ");
                if (!WazeBarSettings.header[state]) WazeBarSettings.header[state] = {};
                if (this.checked) {
                    WazeBarSettings.header[state].forum = States[state].forum;
                    WazeBarSettings.header[state].abbr = States[state].abbr;
                } else delete WazeBarSettings.header[state].forum;

                SaveSettings();
            });
            $("#" + states[i].replace(" ", "_") + "WikiSetting").change(function () {
                var state = this.id.replace("WikiSetting", "").replace("_", " ");
                if (!WazeBarSettings.header[state]) WazeBarSettings.header[state] = {};
                if (this.checked) {
                    WazeBarSettings.header[state].wiki = States[state].wiki;
                    WazeBarSettings.header[state].abbr = States[state].abbr;
                } else delete WazeBarSettings.header[state].wiki;

                SaveSettings();
            });
            $("#" + states[i].replace(" ", "_") + "UnlockSetting").change(
                function () {
                    var state = this.id.replace("UnlockSetting", "").replace("_", " ");
                    if (!WazeBarSettings.header[state])
                        WazeBarSettings.header[state] = {};
                    if (this.checked) {
                        WazeBarSettings.header[state].unlock =
                            location.origin +
                            "/forum/search.php?keywords=" +
                            state +
                            "&terms=all&author=&sv=0&fid%5B%5D=622&sc=1&sf=titleonly&sr=topics&sk=t&sd=d&st=0&ch=300&t=0&submit=Search";
                        WazeBarSettings.header[state].abbr = States[state].abbr;
                    } else delete WazeBarSettings.header[state].unlock;

                    SaveSettings();
                }
            );
        }
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
            ".WazeBarText { display: inline; padding-right: 5px; margin-right: 5px; border-right: thin solid grey; font-size: " +
            WazeBarSettings.BarFontSize + "px; }",
            ".WazeBarIcon { display: inline; margin-left: 3px; cursor: pointer; }",
            "#WazeBarFavorites { max-height: 300px; z-index: 100; overflow: auto; display: none; position: absolute; background-color: #f9f9f9; min-width: 200px; box-shadow: 0px 8px 16px 0px rgba(0, 0, 0, 0.2); margin-top: -2px; padding: 10px; }",
            "#WazeBarFavoritesList { list-style: none; padding: 0; margin: 0; }",
            ".favorite-item { position: relative; padding: 8px 12px; margin: 4px 0; background: #f1f1f1; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; }",
            ".favorite-item a { flex-grow: 1; text-decoration: none; color: #333; }",
            ".favorite-item i { cursor: pointer; color: #c00; }",
            ".favorite-item:hover { background: #e1e1e1; }",
            "#WazeBarFavoritesAddContainer { display: flex; flex-direction: column; margin-top: 10px; gap: 8px; }",
            "#WazeBarFavoritesAddContainer input { height: 20px; border: 1px solid #000000; padding: 4px; border-radius: 4px; }",
            "#WazeBarAddFavorite { padding: 8px 12px; background-color: #007bff; color: #fff; border: none; border-radius: 4px; cursor: pointer; }",
            "#WazeBarAddFavorite:hover { background-color: #0056b3; }",
            ".WazeBarText.WazeBarWikiItem a { color: " + WazeBarSettings.WikiFontColor + "; }",
            ".WazeBarText.WazeBarForumItem a { color: " + WazeBarSettings.ForumFontColor + "; }",
            ".WazeBarText.WazeBarCurrState a { color: #FF0000; }",
            "@keyframes fadeIn { 99% { visibility: hidden; } 100% { visibility: visible; }}"
        ].join(" ");
        $('<style type="text/css" id="WazeBarStyles">' + css + "</style>").appendTo("head");
    }

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
            //inboxInterval: 5, // only used for Inbox is no longer needed with /discuss platform
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
            ForumFontColor: "#45B8D1",
            WikiFontColor: "#69BF88",
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

    function SaveSettings() {
        if (localStorage) {
            /*
                  Object.keys(obj).forEach(function(key,index) {
                  // key: the name of the object key
                  // index: the ordinal position of the key within the object
                  });
                  */
            var localsettings = {
                //inboxInterval: WazeBarSettings.inboxInterval,// only used for Inbox is no longer needed with /discuss platform
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
