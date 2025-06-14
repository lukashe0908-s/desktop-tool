import path from 'path';
import fs from 'fs-extra';
import { app, ipcMain, screen } from 'electron';
import serve from 'electron-serve';
import { createWindow } from './helpers';
import { BrowserWindow, Menu } from 'electron';
import Store from 'electron-store';
import AutoLaunch from 'auto-launch';
import systeminformation from 'systeminformation';
import contextMenu from 'electron-context-menu';
import { setupTitlebar, attachTitlebarToWindow } from 'custom-electron-titlebar/main';

const isProd = process.env.NODE_ENV === 'production';
if (isProd) {
  serve({ directory: 'build/app' });
} else {
  // app.setPath('userData', `${app.getPath('userData')} (development)`)
  app.setPath('userData', path.join(process.cwd(), '.data'));
}
let mainWindow_g: BrowserWindow;
let settingsWindow_g: BrowserWindow;
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow_g) {
      if (mainWindow_g.isMinimized()) mainWindow_g.restore();
      mainWindow_g.focus();
    }
  });
}
const store = new Store();
Menu.setApplicationMenu(null);
contextMenu({
  showSearchWithGoogle: false,
  showCopyLink: false,
  showLearnSpelling: false,
  showLookUpSelection: false,
  labels: {
    cut: '剪切',
    copy: '复制',
    paste: '粘贴',
    selectAll: '全选',
    copyImage: '复制图像',
    inspect: '检查',
  },
});
// setupTitlebar();

function getProviderPath(params: string) {
  if (isProd) {
    if (store.get('online')) return `https://dt.mise.run.place${params}`;
    // return `https://dt.misee.dns.army${params}`;
    return `app://-${params}`;
  } else {
    const port = process.argv[2];
    return `http://localhost:${port}${params}`;
  }
}

(async () => {
  await app.whenReady();
  let winWidth = (() => {
    let base = screen.getPrimaryDisplay().size.width * 0.13;
    if (base < 200) base = 200;
    base = Math.floor(base);
    return base;
  })();
  let winHeight = (() => {
    let base = screen.getPrimaryDisplay().workArea.height * 1;
    base = Math.floor(base);
    return base;
  })();

  const mainWindow = new BrowserWindow({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false,
    },
    backgroundMaterial: isProd ? 'acrylic' : 'none',
    roundedCorners: true,
    // transparent: true,
    frame: false,
    width: winWidth,
    height: winHeight,
    x: screen.getPrimaryDisplay().workArea.width - winWidth,
    y: 0,
    skipTaskbar: true,
    resizable: !isProd,
  });
  mainWindow.webContents.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
  );
  mainWindow.on('close', () => {
    mainWindow_g = undefined;
  });
  mainWindow_g = mainWindow;
  resizeWindow();
  ipcMain.on('set-config', async (event, ...arg) => {
    resizeWindow();
  });
  function resizeWindow() {
    const widthP = store.get('display.windowWidth');
    const heightP = store.get('display.windowHeight');
    if (widthP || heightP) {
      winWidth = (() => {
        let base = screen.getPrimaryDisplay().size.width * Number(widthP);
        if (base < 200) base = 200;
        base = Math.floor(base);
        return base;
      })();
      winHeight = (() => {
        let base = screen.getPrimaryDisplay().workArea.height * Number(heightP);
        base = Math.floor(base);
        return base;
      })();
      mainWindow.setResizable(true);
      mainWindow.setSize(winWidth, winHeight);
      mainWindow.setResizable(false);
      mainWindow.setPosition(screen.getPrimaryDisplay().workArea.width - winWidth, 0);
    }
  }

  if (isProd) {
    await mainWindow.loadURL(getProviderPath('/float'));
  } else {
    await mainWindow.loadURL(getProviderPath('/home'));
    // mainWindow.webContents.openDevTools()
  }
  ipcMain.on('close-window', async (event, arg) => {
    mainWindow.close();
    app.quit();
  });
})();

app.on('window-all-closed', () => {
  app.quit();
});

ipcMain.on('get-config', async (event, signal, name: string) => {
  event.reply('get-config/' + signal, store.get(name));
});
ipcMain.on('set-config', async (event, name: string, value: any) => {
  store.set(name, value);
  mainWindow_g.webContents.send('sync-config');
});
ipcMain.on('get-version', async event => {
  event.reply('get-version', app.getVersion());
});

// 不可在触屏上正常使用
ipcMain.on('mainWindow_ignoreMouseEvent', async (event, value: boolean) => {
  // console.log(arg[0]);
  if (value === true) {
    mainWindow_g.setIgnoreMouseEvents(true, { forward: true });
  } else {
    mainWindow_g.setIgnoreMouseEvents(false);
  }
});

ipcMain.on('showContextMenu_listTime', (event, splitChecked: boolean = false) => {
  const contextMenu = Menu.buildFromTemplate([
    {
      label: `在下方插入分隔符`,
      type: 'checkbox',
      checked: splitChecked,
      click: menuItem => {
        event.sender.send('showContextMenu_listTime', 'divide', menuItem.checked);
      },
    },
    { type: 'separator' },
    {
      label: '清空',
      click: () => {
        event.sender.send('showContextMenu_listTime', 'clear');
      },
    },
  ]);
  contextMenu.popup({ window: BrowserWindow.fromWebContents(event.sender) });
});

ipcMain.on('autoLaunch', async (event, actionName: 'get' | 'set', value?: boolean) => {
  var AutoLauncher = new AutoLaunch({
    name: app.getName(),
  });
  if (actionName === 'get') {
    AutoLauncher.isEnabled().then(isEnabled => {
      event.reply('autoLaunch', isEnabled);
    });
  } else if (actionName === 'set') {
    if (value) {
      AutoLauncher.enable();
    } else {
      AutoLauncher.disable();
    }
  }
});

ipcMain.on('systeminformation', async (event, signal, action: any) => {
  systeminformation.get(action).then(data => {
    event.reply('systeminformation/' + signal, data);
  });
});

ipcMain.on('sys-shutdown', async (event, arg) => {
  const cp = require('child_process');
  cp.execSync('shutdown -s -t 0');
});

ipcMain.on('settings-window', async (event, arg) => {
  if (settingsWindow_g) {
    settingsWindow_g.show();
    return;
  }
  const settingsWindow = createWindow('settingsWindow', {
    width: 1000,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false,
    },
    maximizable: true,
    resizable: true,
  });
  settingsWindow.on('close', () => {
    settingsWindow_g = undefined;
  });
  settingsWindow_g = settingsWindow;

  arg && arg[0] && settingsWindow.webContents.openDevTools();

  await settingsWindow.loadURL(getProviderPath('/settings'));
});
ipcMain.on('ai-window', async (event, arg) => {
  const window = createWindow('aiWindow', {
    backgroundMaterial: 'acrylic',
    width: 1000,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
    maximizable: true,
    resizable: true,
  });
  await window.loadURL(getProviderPath('/ai'));
});
