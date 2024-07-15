'use strict';

const { join: pathJoin, resolve: pathResolve } = require('path');
const { existsSync } = require('fs');

// eslint-disable-next-line import/no-extraneous-dependencies
const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');

const templates = require('./templates');
const { listBoldFonts } = require('./fonts');

const isMac = process.platform === 'darwin';

const WIDTH = 4200;
const HEIGHT = 3250;
const SCALE = 0.252;

/**
 * @typedef {import('electron/main').MenuItemConstructorOptions} MenuItemConstructorOptions
 */

/** @param {Error} err */
function dieOnError(err) {
  process.nextTick(() => {
    throw err;
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: Math.ceil(WIDTH * SCALE),
    height: Math.floor((HEIGHT + 100) * SCALE),
    webPreferences: {
      nodeIntegration: true,
    },
    resizable: false,
    icon: `${__dirname}/build/icon.png`,
  });

  win.loadFile(pathJoin(__dirname, 'index.html'));

  return win;
}

/**
 * @param {BrowserWindow} win
 * @return {MenuItemConstructorOptions[]}
 */
function templateMenuItems(win) {
  return templates.map(({ name: label }, i) => ({
    label,
    type: 'radio',
    id: `tmpl${i}`,
    checked: i === 0,
    click: () => win.webContents.send('template', i),
  }));
}

/**
 * @param {BrowserWindow} win
 * @param {import('./fonts').Font[]} fontList
 * @return {MenuItemConstructorOptions[]}
 */
function fontMenuItems(win, fontList) {
  return fontList.map(({ cssFontFamily, imFontName }, i) => ({
    label: cssFontFamily,
    type: 'radio',
    id: `font-${imFontName}`,
    checked: i === 0,
    click: () => win.webContents.send('font', { cssFontFamily, imFontName }),
  }));
}

const configFilters = [{ name: 'JSON Configs', extensions: ['json'] }];

/** @param {BrowserWindow} win */
async function handleSaveConfigAs(win) {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Save Matte Config',
    filters: configFilters,
  });
  if (!canceled) {
    await win.webContents.send('saveAs', filePath);
  }
}

/**
 * @param {BrowserWindow} win
 * @param {string} filePath
 */
function sendLoadConfig(win, filePath) {
  return win.webContents.send('load', filePath);
}

/**
 * @param {BrowserWindow} win
 * @param {string | null} defaultPath
 */
async function handleLoadConfig(win, defaultPath) {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Open Matte Config',
    filters: configFilters,
    defaultPath: defaultPath || undefined,
    properties: ['openFile'],
  });
  if (!canceled) await sendLoadConfig(win, filePaths[0]);
}

/** @param {BrowserWindow} win */
async function handleExport(win) {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Export as PNG',
    filters: [{ name: 'PNG files', extensions: ['png'] }],
  });
  if (!canceled) await win.webContents.send('export', filePath);
}

/** @param {string} id */
function getMenuItem(id) {
  const appMenu = Menu.getApplicationMenu();
  if (!appMenu) throw new Error('No app menu!?');
  return appMenu.getMenuItemById(id);
}

/**
 * @param {boolean} condition
 * @param {MenuItemConstructorOptions[]} items
 */
function menuItemsIf(condition, items) {
  return condition ? items : [];
}

/** @param {number} i */
function setTemplate(i) {
  const menuItem = getMenuItem(`tmpl${i}`);
  if (menuItem) menuItem.checked = true;
}

/** @param {BrowserWindow} win */
async function createMenus(win) {
  ipcMain.on('infoBox', (ev, opts) => {
    dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['OK'],
      ...opts,
    });
  });

  ipcMain.on('saveAs', () => handleSaveConfigAs(win));

  ipcMain.on('template', (ev, i) => setTemplate(i));

  ipcMain.on('open', (ev, defaultPath) => {
    handleLoadConfig(win, defaultPath);
  });

  const fontList = await listBoldFonts();
  const fallbackFont = fontList[0];
  ipcMain.on('font', async (ev, id) => {
    const menu = getMenuItem(`font-${id}`);
    if (menu) menu.checked = true;
    else {
      await dialog.showMessageBox(win, {
        type: 'warning',
        buttons: ['OK'],
        message: `Unable to find font "${id}" locally; falling back on ${fallbackFont.cssFontFamily}`,
      });
      win.webContents.send('font', fallbackFont);
    }
  });

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...menuItemsIf(isMac, [{ role: 'appMenu' }]),

      {
        id: 'file',
        label: 'File',
        submenu: [
          {
            label: 'New Matte',
            accelerator: 'CommandOrControl+N',
            id: 'new',
            click: () => {
              setTemplate(0);
              win.webContents.send('new');
            },
          },

          { type: 'separator' },

          {
            label: 'Open Matte Config...',
            id: 'load',
            accelerator: 'CommandOrControl+O',
            click: () => win.webContents.send('open'),
          },
          {
            label: 'Save Matte Config',
            id: 'save',
            accelerator: 'CommandOrControl+S',
            click: () => win.webContents.send('save'),
          },
          {
            label: 'Save Matte Config As...',
            id: 'saveAs',
            click: () => handleSaveConfigAs(win),
          },

          { type: 'separator' },

          {
            label: 'Export as PNG...',
            accelerator: 'CommandOrControl+E',
            click: () => handleExport(win),
          },

          ...menuItemsIf(!isMac, [{ type: 'separator' }, { role: 'quit' }]),
        ],
      },

      {
        label: 'Edit',
        submenu: [
          {
            label: 'Copy Convert Command',
            accelerator: 'CommandOrControl+C',
            click: () => win.webContents.send('copy'),
          },

          { type: 'separator' },

          {
            label: 'Remove Image',
            id: 'remove',
            click: () => win.webContents.send('remove'),
          },
        ],
      },

      { label: 'Template', submenu: templateMenuItems(win) },

      { label: 'Font', submenu: fontMenuItems(win, fontList) },

      ...menuItemsIf(!app.isPackaged, [
        {
          label: 'Developer',
          submenu: [
            { role: 'reload' },
            { role: 'forceReload' },
            { role: 'toggleDevTools' },
          ],
        },
      ]),
    ])
  );
}

app
  .whenReady()
  .then(async () => {
    const win = createWindow();
    await createMenus(win);
    const cfgArg = process.argv[2];
    win.webContents.once('did-finish-load', () => {
      if (cfgArg && existsSync(cfgArg)) {
        sendLoadConfig(win, pathResolve(cfgArg));
      }
    });
  })
  .catch(dieOnError);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
