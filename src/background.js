/* global browser */
import iconColor from './iconcolor.js';
import w3color from './w3color.js';

const NS_XHTML = 'http://www.w3.org/1999/xhtml';
const globalSheet = browser.runtime.getURL('browser.css');
export let defaultOptions = {
  displayCloseButton: false,
  displayNewtab: false,
  displayPlaceholders: false,
  displayTitlebar: false,
  enableIconColors: true,
  fitLightness: true,
  font: '',
  forceCompact: true,
  maxLightness: 100,
  maxTabRows: 3,
  maxTabSize: 300,
  minLightness: 59,
  minTabHeight: 27,
  minTabSize: 120,
  tabSize: 3,
  userCSS: '',
  userCSSCode: ''
  // userCSSCode: ":root{\n  --multirow-n-rows: 3; \n  --multirow-tab-min-width: 100px;\n  --multirow-tab-dynamic-width: 1; \n  --tab-min-height: 32px !important ;\n  --tab-block-margin: 0px !important;\n}\n\n#tabbrowser-tabs{\n  min-height: unset !important;\n  padding-inline-start: 0px !important;\n  padding-inline: 0 !important;\n}\n\n@-moz-document url(chrome://browser/content/browser.xhtml){\n  #scrollbutton-up~spacer,\n  #scrollbutton-up,\n  #scrollbutton-down{ display: var(--scrollbutton-display-model,initial) }\n\n  scrollbox[part][orient=\"horizontal\"]{\n    display: flex;\n    flex-wrap: wrap;\n    overflow-y: auto;\n    max-height: calc((var(--tab-min-height) + 2 * var(--tab-block-margin,0px)) * var(--multirow-n-rows));\n    scrollbar-color: currentColor transparent;\n    scrollbar-width: thin;\n    scroll-snap-type: y mandatory;\n    scrollbar-gutter: stable;\n    scroll-snap-stop: always !important;\n  }\n}\n\n.scrollbox-clip[orient=\"horizontal\"],\n#tabbrowser-arrowscrollbox{\n  overflow: -moz-hidden-unscrollable;\n  display: inline;\n  --scrollbutton-display-model: none;\n}\n\n\n\n/* .tabbrowser-tab */ /********** Single tab **********/\n.tabbrowser-tab{ scroll-snap-align: start; }\n\n#tabbrowser-tabs .tabbrowser-tab[pinned]{\n  position: static !important;\n  margin-inline-start: 0px !important;\n}\n\n.tabbrowser-tab[fadein]:not([pinned]){\n  min-width: var(--multirow-tab-min-width) !important;\n  flex-grow: var(--multirow-tab-dynamic-width) !important;\n}\n\n.tabbrowser-tab > stack{ width: 100%; height: 100% }\n\n#tabs-newtab-button{ margin-bottom: 0 !important; }\n\n#tabbrowser-tabs[hasadjacentnewtabbutton][overflow] > #tabbrowser-arrowscrollbox > #tabbrowser-arrowscrollbox-periphery > #tabs-newtab-button {\n  display: flex !important;\n}\n\n#alltabs-button,\n:root:not([customizing]) #TabsToolbar #new-tab-button,\n#tabbrowser-arrowscrollbox > spacer,\n.tabbrowser-tab::after{ display: none !important }\n\n@media (-moz-bool-pref: \"userchrome.multirowtabs.full-width-tabs.enabled\"){\n  .tabbrowser-tab[fadein]:not([pinned]){ max-width: 100vw !important; }\n}\n@media (-moz-bool-pref: \"userchrome.multirowtabs.scrollbar-handle.enabled\"){\n  #tabbrowser-arrowscrollbox{ -moz-window-dragging: no-drag }\n}\n\n#TabsToolbar #tabs-newtab-button {\n  margin: 0 !important;\n  display: none !important;\n  align-self: flex-end;\n  /* In some configurations the button may be hidden */\n  visibility: visible !important;\n}",
};

let cachedOptions = {};
// In currentOptionsSheet we keep track of the dynamic stylesheet that applies
// options (such as the user font), so that we can unload() the sheet once the
// options change.
let currentOptionsSheet = '';
let iconSheets = new Map();

function makeDynamicSheet(options) {
  // User options are applied via a dynamic stylesheet. Doesn't look elegant
  // but keeps the API small.
  let rules = `
    @import url('${options.userCSS}');
    @import url('data:text/css;base64,${btoa(options.userCSSCode)}');
    @namespace url('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul');
    #navigator-toolbox {
      ${options.font ? `--paxmod-font: ${options.font};` : ''}
      --paxmod-tab-size: ${options.tabSize}%;
      --paxmod-min-tab-size: ${options.minTabSize}px;
      --paxmod-max-tab-size: ${options.maxTabSize}px;
      --tab-min-height: ${options.minTabHeight}px !important;
      --paxmod-max-tab-rows: ${options.maxTabRows} !important;
      --paxmod-display-newtab: ${options.displayNewtab ? '-webkit-box' : 'none'};
      --paxmod-titlebar-display: ${options.displayTitlebar ? '-webkit-box' : 'none'};
      --paxmod-titlebar-placeholders: ${options.displayPlaceholders ? '1000px' : '0px'};
      --paxmod-display-close-button: ${options.displayCloseButton ? '-webkit-box' : 'none'};
      ${options.forceCompact && '--proton-tab-block-margin: 0; --tab-block-margin: 0;'}
    }
    ${options.forceCompact && `
      .tabbrowser-tab {
        padding-inline: 0 !important;
      }
      .tabbrowser-tab[usercontextid] > .tab-stack > .tab-background > .tab-context-line {
          margin-top: 0;
      }
    `}
  `;
  // -webkit-box is used as a replacement for -moz-box which doesn't seem to
  // work in FF >= 63. That's possibly an internal bug.

  // CSS rules are base64-encoded because the native StyleSheetService API
  // can't handle some special chars.
  console.log('RULE:');
  console.log(rules);
  return `data:text/css;base64,${btoa(rules)}`;
}

// Return a version of SVG `data:` URL `url` with specific dimensions
//
// Needed because an SVG without specified width/height appears to have zero
// size and can't be drawn on a canvas which we need to extract image data.
function patchSVGDataURL(url) {
  let code = atob(url.split( ',', 2)[1]);
  let dom = (new DOMParser()).parseFromString(code, 'image/svg+xml');
  if (dom.documentElement.nodeName !== 'svg') {
    // May happen on XML parsing errors
    throw 'Failed to build SVG DOM';
  }
  dom.documentElement.setAttribute('width', '64');
  dom.documentElement.setAttribute('height', '64');
  code = (new XMLSerializer()).serializeToString(dom);
  return `data:image/svg+xml;base64,${btoa(code)}`;
}

async function addIconColor(url, urlOrig = null) {
  if ((!url) || url.startsWith('chrome://') || url.includes('\'') || iconSheets.has(url)) {
    return;
  }
  let img = document.createElementNS(NS_XHTML, 'img');
  img.addEventListener('load', () => {
    if (!urlOrig && img.width == 0 && url.startsWith('data:')) {
      addIconColor(patchSVGDataURL(url), url);
      return;
    }
    let color = iconColor(
      img,
      Number(cachedOptions.minLightness),
      Number(cachedOptions.maxLightness),
    );
    // We can't access the chrome DOM, so apply each favicon color via stylesheet
    let sheetText = `data:text/css,tab.tabbrowser-tab[image='${urlOrig || url}'] .tab-label { color: ${color} !important; }`;
    browser.stylesheet.load(sheetText, 'AUTHOR_SHEET');
    iconSheets.set(urlOrig || url, sheetText);
    img.remove();
  });
  img.src = url;
}

async function addAllIconColors() {
  let tabs = await browser.tabs.query({});
  for (let tab of tabs) {
    if (tab.favIconUrl) {
      addIconColor(tab.favIconUrl);
    }
  }
}

function removeAllIconColors() {
  for (let sheet of iconSheets.values()) {
    browser.stylesheet.unload(sheet, 'AUTHOR_SHEET');
  }
  iconSheets.clear();
}

export async function getOptions() {
  return await browser.storage.local.get();
}

export async function setOptions(options) {
  await browser.storage.local.set(options);
}

export async function applyOptions() {
  let options = await getOptions();
  let theme = await browser.theme.getCurrent();
  if (options.fitLightness !== false) {
    Object.assign(options, getBestLightnessOptions(theme));
  }
  removeAllIconColors();
  cachedOptions.minLightness = options.minLightness;
  cachedOptions.maxLightness = options.maxLightness;

  let newOptionsSheet = makeDynamicSheet(options);
  if (currentOptionsSheet) {
    await browser.stylesheet.unload(currentOptionsSheet, 'AUTHOR_SHEET');
  }
  await browser.stylesheet.load(newOptionsSheet, 'AUTHOR_SHEET');
  currentOptionsSheet = newOptionsSheet;
  if (options.enableIconColors) {
    if (!browser.tabs.onUpdated.hasListener(onFavIconChanged)) {
      browser.tabs.onUpdated.addListener(onFavIconChanged, {properties: ["favIconUrl"]});
    }
    await addAllIconColors();
  } else {
    if (browser.tabs.onUpdated.hasListener(onFavIconChanged)) {
      browser.tabs.onUpdated.removeListener(onFavIconChanged);
    }
  }
}

function onFavIconChanged(tabId, changeInfo) {
  addIconColor(changeInfo.favIconUrl);
}

// Return the best tab lightness settings for a given theme
export function getBestLightnessOptions(theme) {
  // Maps theme color properties to whether their lightness corresponds to the
  // inverted theme lightness, ordered by significance
  let invertColorMap = {
    tab_text: true,
    textcolor: true,
    tab_selected: false,
    frame: false,
    accentcolor: false,
    bookmark_text: true,
    toolbar_text: true,
  };
  let light = {
    minLightness: 0,
    maxLightness: 52,
  };
  let dark = {
      minLightness: 59,
      maxLightness: 100,
  };
  let colors = theme.colors;
  if (!colors) {
    return light;
  }
  for (let prop in invertColorMap) {
    if (!colors[prop]) {
      continue;
    }
    return (w3color(colors[prop]).isDark() !== invertColorMap[prop]) ? dark : light;
  }
  return light;
}

async function startup() {
  if (!('paxmod' in browser && 'stylesheet' in browser)) {
    browser.tabs.create({url: browser.runtime.getURL('missing_api.html')});
  }

  browser.stylesheet.load(globalSheet, 'AUTHOR_SHEET');
  browser.paxmod.load();
  let options = await getOptions();
  let newOptions = {};
  for (let key in defaultOptions) {
    if (!(key in options)) {
      newOptions[key] = defaultOptions[key];
    }
  }
  if (Object.keys(newOptions).length > 0) {
    await setOptions(newOptions);
  }
  applyOptions();

  // When idiling, occasionally check if icon sheets should be refreshed to
  // avoid growing a large cache.
  browser.idle.setDetectionInterval(60 * 10);
  browser.idle.onStateChanged.addListener(async (state) => {
    if (state === 'idle' && iconSheets.size > 1000 &&
        iconSheets.size > (await browser.tabs.query({})).length * 1.5) {
      removeAllIconColors();
      await addAllIconColors();
    }
  });
}

browser.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    browser.tabs.create({url: browser.runtime.getManifest().homepage_url});
  }
});

browser.theme.onUpdated.addListener(async details => {
  if ((await browser.storage.local.get('fitLightness')).fitLightness !== false) {
    // Re-apply options, so the lightness settings fit the new theme
    applyOptions();
  }
});

startup();
