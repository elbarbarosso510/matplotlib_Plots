'use strict';

/* eslint-env browser,jquery */

(() => {
  const {
    resolve: pathResolve,
    dirname,
    relative: pathRelative,
  } = require('path');
  const { writeFileSync, readFileSync, statSync } = require('fs');
  const { promisify } = require('util');
  const execFile = promisify(require('child_process').execFile);

  // eslint-disable-next-line import/no-extraneous-dependencies
  const { ipcRenderer, clipboard } = require('electron');

  const templateCuts = require('./templates');

  // eslint-disable-next-line no-console
  const log = console.log.bind(console);

  /**
   * @typedef MetricsBox
   * @property {{ cropX: number, cropY: number, cropW: number, cropH: number }} crop
   * @property {number} width
   * @property {number} height
   * @property {{ top: number, left: number }} pos
   * @property {string} path
   * @property {string} [caption]
   *
   * @typedef Metrics
   * @property {MetricsBox} [box1]
   * @property {MetricsBox} [box2]
   * @property {MetricsBox} [box3]
   * @property {MetricsBox} [box4]
   * @property {MetricsBox} [box5]
   * @property {MetricsBox} [box6]
   * @property {MetricsBox} [box7]
   *
   * @typedef Settings
   * @property {string} cssFontFamily
   * @property {string} imFontName
   * @property {number} version
   * @property {number} curTemplate
   * @property {string} savedAt
   * @property {string} saveFile
   * @property {Metrics} metrics
   */

  // given a relative path (e.g. imgs/x.jpg or ../y.jpg) and an absolute path
  // to a config file (e.g. /Users/bob/d/c.json), return an absolutized version
  // of the former, e.g. /Users/bob/d/imgs/x.jpg or /Users/bob/y.jpg respectively
  /**
   * @param {string} relPath
   * @param {string | null} cfgPath
   */
  function absolutePath(relPath, cfgPath) {
    return cfgPath ? pathResolve(dirname(cfgPath), relPath) : relPath;
  }

  // given an absolute path to an image and an absolute path to a config file
  // (e.g. /Users/bob/d/c.json), return a relativized version of the former
  // iff it's on the same device as the config path
  // e.g. /Users/bob/d/imgs/x.jpg, /Users/bob/d/cfg.json -> imgs/x.jpg
  // but  /Volumes/ext/x.jpg, /Users/bob/d/cfg.json -> /Volumes/ext/x.jpg
  /**
   * @param {string} absPath
   * @param {string | null} cfgPath
   */
  function relativePath(absPath, cfgPath) {
    if (!cfgPath) return absPath;
    const cfgDir = dirname(cfgPath);
    const cfgDev = statSync(cfgDir).dev;
    const imgDev = statSync(absPath).dev;
    return cfgDev === imgDev ? pathRelative(cfgDir, absPath) : absPath;
  }

  const lineWidth = 50;
  const bufferSize = 120;
  const matteWidth = 4200;
  const matteFullHeight = 3250;
  const matteHeight = matteFullHeight - bufferSize;
  const settingsVersion = 2;
  /** @type {string} */
  let selectedBox;
  /** @type {Metrics} */
  let metrics;
  /** @type {number} */
  let curTemplate;
  /** @type {string | null} */
  let saveFile = null;
  let cssFontFamily = 'Arial';
  let imFontName = 'Arial-Bold';

  /* Template 1,2,3,7
  +---------+----------+
  |         |          |
  |         |    1     |
  |         +-----+----+
  |    0    |  3  |    |
  |         +--+--+    |
  |         |  |5 | 2  |
  |         | 4|6 |    |
  +---------+--+--+----+
   *   Template 4,5,6
  +----------+---------+
  |          |         |
  |    1     |         |
  +----+-----+         |
  |    |  3  |    0    |
  |    +--+--+         |
  | 2  |  |5 |         |
  |    | 4|6 |         |
  +----+--+--+---------+
   */

  /**
   * convert templates from {
   *   name: string,
   *   cuts: { box: number, (top | left | right)?: { pct: number } }[],
   *   buffer?: 'top'
   * } to {
   *   name: string,
   *   boxes: { top: string, left: string, width: string, height: string }[],
   * }
   *
   * @typedef {{ x: number, y: number, w: number, h: number }} Box
   */
  const templates = templateCuts.map(({ name, cuts, buffer }) => {
    const y = buffer === 'top' ? bufferSize : 0;
    /** @type {Box[]} */
    const boxes = [{ x: 0, y, w: matteWidth, h: matteHeight }];
    cuts.forEach(cut => cutBox(boxes, cut));
    return {
      name,
      boxes: boxes.map(({ x, y: top, w, h }) => ({
        top: `${top}px`,
        left: `${x}px`,
        width: `${w}px`,
        height: `${h}px`,
      })),
    };
  });

  /**
   * @param {string | null} oldSaveFile
   * @param {string} newSaveFile
   */
  function fixupRelativeMetricPaths(oldSaveFile, newSaveFile) {
    for (const m of Object.values(metrics)) {
      if (!m) continue; // make TS happy
      m.path = relativePath(absolutePath(m.path, oldSaveFile), newSaveFile);
    }
  }

  /** @param {Settings} settings */
  function migrateSettings(settings) {
    while (settings.version < settingsVersion) {
      // each case N is the migration to do from N -> N+1
      switch (settings.version) {
        case null:
          settings.version = 0;
          break;
        case 1:
          /** @ts-ignore */
          settings.cssFontFamily = settings.fontFamily;
          /** @ts-ignore */
          delete settings.fontFamily;
          settings.imFontName = `${settings.cssFontFamily.replace(
            / /g,
            ''
          )}-Bold`;
          break;
        default:
          // no migration for this version
          break;
      }
      settings.version++;
    }
  }

  const AUTO_SAVE = 'autoSave';
  function autoSaveConfig() {
    const json = JSON.stringify({
      metrics,
      curTemplate,
      saveFile,
      cssFontFamily,
      imFontName,
      version: settingsVersion,
      savedAt: new Date().toISOString(),
    });
    localStorage.setItem(AUTO_SAVE, json);
  }

  /** @type {NodeJS.Timeout} */
  let noticeHideTimer;
  /** @param {string} txt */
  function flashNotice(txt) {
    clearTimeout(noticeHideTimer);
    $('#notice').text(txt).toggleClass('shown', true);
    noticeHideTimer = setTimeout(
      () => $('#notice').toggleClass('shown', false),
      2000
    );
  }

  function saveConfigToFile() {
    if (!saveFile) return;
    autoSaveConfig();
    const settings = JSON.parse(localStorage.getItem(AUTO_SAVE) || '');
    delete settings.saveFile;
    const settingsJSON = JSON.stringify(settings, null, 2);
    writeFileSync(saveFile, settingsJSON);
    flashNotice(`Config saved to ${saveFile}`);
  }

  /**
   * @param {number} i
   */
  function loadTemplate(i) {
    metrics = {};
    curTemplate = i;
    const $matte = $('#matte').empty();
    templates[i].boxes.forEach((box, j) =>
      $('<div>')
        .css(box)
        .attr('id', `box${j + 1}`)
        .appendTo($matte)
    );

    $('#matte > div').click(function onClick(e) {
      e.preventDefault();
      const id = /** @type {keyof Metrics} */ ($(this).attr('id'));
      if ($('body').hasClass('deleting')) {
        $(this).find('.cropFrame').remove();
        $(this).find('textarea').remove();
        delete metrics[id];
        autoSaveConfig();
        $('body').removeClass('deleting');
      } else if ($(this).find('img').length === 0) {
        selectedBox = id;
        $('#file')[0].click();
      }
    });
  }

  /** @param {HTMLElement} e */
  function resetCaptionHeight(e) {
    $(e).height(5);
    $(e).height(e.scrollHeight + 20);
  }

  /** @param {string} path */
  function loadFileToBox(path) {
    const $box = $(`#${selectedBox}`);
    const width = $box.width();
    const height = $box.height();
    if (!width || !height) {
      throw new Error(`invalid width or height: ${width}x${height}`);
    }
    const $img =
      /** @type {JQuery<HTMLElement> & { cropbox(opts: any): JQuery<HTMLElement>}} */
      ($('<img>').attr('src', absolutePath(path, saveFile)).appendTo($box));
    const key = /** @type {keyof Metrics} */ ($box.attr('id'));
    const box = metrics[key]; // set iff we're loading/restoring
    const pos = $box.position();
    $img
      .cropbox({
        width,
        height,
        zoom: 65e7 / width / height,
        controls: false,
        showControls: 'never',
        result: box && box.crop,
      })
      .on('cropbox', (ce, crop) => {
        metrics[key] = {
          ...box,
          crop,
          width,
          height,
          pos,
          path,
        };
        autoSaveConfig();
      });
    const $ta = $('<textarea>')
      .css('fontFamily', cssFontFamily)
      .appendTo($box)
      .on('keyup', function onTAKeyup() {
        resetCaptionHeight(this);
        const croppedBox = metrics[key];
        if (!croppedBox) {
          throw new Error(`cropbox failed to init metrics for ${key}`);
        }
        croppedBox.caption = /** @type {string} */ ($(this).val());
        autoSaveConfig();
      });
    $ta.val((box && box.caption) || '');
    resetCaptionHeight($ta[0]);
  }

  /** @param {Settings} settings */
  function loadSettings(settings) {
    migrateSettings(settings);
    ({ curTemplate, imFontName, cssFontFamily } = settings);
    loadTemplate(curTemplate);
    ({ metrics, saveFile } = settings);
    for (const [id, box] of Object.entries(metrics)) {
      if (!box) continue;
      selectedBox = id;
      loadFileToBox(box.path);
    }
    ipcRenderer.send('template', curTemplate);
    ipcRenderer.send('font', imFontName);
  }

  function autoLoadConfig() {
    const settingsJSON = localStorage.getItem(AUTO_SAVE);
    if (!settingsJSON) return false;
    const settings = JSON.parse(settingsJSON);
    log(`Loading settings saved at ${settings.savedAt}`);
    loadSettings(settings);
    return true;
  }

  /** @param {string} filePath */
  function loadConfigFromFile(filePath) {
    const settings = JSON.parse(readFileSync(filePath, 'utf8'));
    log(`Loading settings from ${filePath}`);
    loadSettings({ ...settings, saveFile: filePath });
  }

  /**
   * @typedef {{ aspect: number } | { pct: number }} Ratio
   *
   * @param {Box[]} boxes
   * @param {{ box: number } & ({ right: Ratio } | { top: Ratio } | { left: Ratio } | { bottom: Ratio })} cut
   */
  function cutBox(boxes, cut) {
    const { box } = cut;
    const { x, y, w, h } = boxes[box];
    let box1;
    let box2;
    /* eslint-disable no-multi-spaces */
    if ('left' in cut || 'right' in cut) {
      const pri = 'left' in cut ? cut.left : cut.right;
      const priW = Math.round('pct' in pri ? w * pri.pct : h * pri.aspect);
      if ('left' in cut) {
        box1 = { x, y, w: priW, h };
        box2 = { x: x + priW + lineWidth, y, w: w - priW - lineWidth, h };
      } else {
        box1 = { x: x + w - priW, y, w: priW, h };
        box2 = { x, y, w: w - priW - lineWidth, h };
      }
    } else {
      const pri = 'top' in cut ? cut.top : cut.bottom;
      const priH = Math.round('pct' in pri ? h * pri.pct : w / pri.aspect);
      if (top) {
        box1 = { x, y, w, h: priH };
        box2 = { x, y: y + priH + lineWidth, w, h: h - priH - lineWidth };
      } else {
        box1 = { x, y: h - priH, w, h: priH };
        box2 = { x, y, w, h: h - priH - lineWidth };
      }
    }
    /* eslint-enable */
    boxes.splice(box, 1);
    boxes.push(box1, box2);
  }

  /** @param {string} arg */
  function escapeShellArg(arg) {
    const esc1 = `'${arg.replace(/'/g, "'\\''")}'`;
    const esc2 = `"${arg.replace(/([!$"\\])/g, '\\$1')}"`;
    const esc3 = arg.replace(/([^\w=+:,.\/-])/g, '\\$1');
    return [esc1, esc2, esc3].sort((a, b) => a.length - b.length)[0];
  }

  /*
   * @param {string} [outFile]
   */
  function generateConvertArgs(outFile = 'out.png') {
    const metricsArgs = Object.values(metrics)
      .map(f => {
        if (!f) throw new Error('wtf'); // make TS happy
        /** @type {string[]} */
        let caption = [];
        if (f.caption) {
          const txt = f.caption.trim().replace(/\n/g, '\\n');
          caption = [
            '(',
            '-background',
            'none',
            '-size',
            `${Math.round(f.width * 0.85)}x225`,
            'xc:none',
            '-stroke',
            'none',
            '-fill',
            'white',
            '-gravity',
            'south',
            '-annotate',
            '0',
            txt,
            '-fill',
            'black',
            '(',
            '+clone',
            '-shadow',
            '100x6+0+0',
            ')',
            '+swap',
            '(',
            '+clone',
            '-shadow',
            '90x12+0+0',
            ')',
            '+swap',
            '(',
            '+clone',
            '-shadow',
            '80x20+0+0',
            ')',
            '+swap',
            '-layers',
            'merge',
            '+repage',
            ')',
            '-gravity',
            'south',
            '-geometry',
            '+0+0',
            '-composite',
          ];
        }
        return [
          '(',
          absolutePath(f.path, saveFile),
          '-normalize',
          '-crop',
          `${f.crop.cropW}x${f.crop.cropH}+${f.crop.cropX}+${f.crop.cropY}`,
          '-resize',
          `${f.width}x${f.height}`,
          ...caption,
          ')',
          '-gravity',
          'northwest',
          '-geometry',
          `+${f.pos.left}+${f.pos.top}`,
          '-composite',
        ];
      })
      .flat(1);

    return [
      '-size',
      `${matteWidth}x${matteFullHeight}`,
      '-font',
      imFontName,
      '-pointsize',
      '72',
      'xc:black',
      ...metricsArgs,
      outFile,
    ];
  }

  /** @param {string} outFile */
  async function runConvert(outFile) {
    // TODO: change command generator to return array, and escape on-the-fly
    // instead of using exec() here
    try {
      flashNotice(`Exporting PNG to ${outFile}, please wait...`);
      const res = await execFile('convert', generateConvertArgs(outFile));
      const withWarnings = res.stderr ? ` with warnings: ${res.stderr}` : '';
      flashNotice(`Exported PNG to ${outFile}${withWarnings}`);
    } catch (err) {
      ipcRenderer.send('infoBox', {
        title: 'Exporting Error',
        message: `Error running convert command: ${err.message}`,
      });
    }
  }

  $(() => {
    $('#file').change(e => {
      const { files } = /** @type {HTMLInputElement} */ (e.target);
      if (!files) return;
      const [{ path }] = files;
      $('#file').val('');
      loadFileToBox(relativePath(path, saveFile));
    });

    // startup
    if (!autoLoadConfig()) loadTemplate(0);
  });

  ipcRenderer.on('remove', () => {
    // TODO: disable the "Remove" menu item when deleting or no open images?
    $('body').toggleClass('deleting', true);
    flashNotice('Select box to remove image from');
  });

  ipcRenderer.on('template', (sender, i) => {
    curTemplate = i;
    autoSaveConfig();
    loadTemplate(i);
    autoLoadConfig();
  });

  ipcRenderer.on('copy', () => {
    const cmdLine = `convert ${generateConvertArgs()
      .map(escapeShellArg)
      .join(' ')}`;
    clipboard.writeText(cmdLine, 'selection');
    flashNotice('Copied convert command to clipboard');
  });

  ipcRenderer.on('new', () => {
    loadTemplate(0);
    saveFile = null;
    autoSaveConfig();
  });

  ipcRenderer.on('saveAs', (ev, filePath) => {
    // if we change the save file, we might need to adjust the relative paths
    fixupRelativeMetricPaths(saveFile, filePath);
    saveFile = filePath;
    saveConfigToFile();
  });

  ipcRenderer.on('save', () => {
    if (saveFile) saveConfigToFile();
    else ipcRenderer.send('saveAs');
  });

  ipcRenderer.on('open', () => {
    ipcRenderer.send('open', saveFile);
  });

  ipcRenderer.on('load', (ev, filePath) => {
    loadConfigFromFile(filePath);
  });

  ipcRenderer.on('font', (ev, font) => {
    ({ imFontName, cssFontFamily } = font);
    autoSaveConfig();
    $('textarea').css('fontFamily', cssFontFamily);
  });

  ipcRenderer.on('export', async (ev, filePath) => {
    await runConvert(filePath);
  });
})();
