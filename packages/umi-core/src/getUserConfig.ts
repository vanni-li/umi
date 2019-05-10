import { join, extname } from 'path';
import { existsSync } from 'fs';
import assert from 'assert';
import extend from 'extend2';
import { IConfig } from 'umi-types';

interface IOpts {
  cwd?: string,
  defaultConfig?: IConfig,
  onError?: Function,
}


/**
 * NOTE: 
 * 返回配置文件的路径(只返回一个)
 * 如果指定了配置文件，从配置文件取，否则从如下文件里取第一个存在的文件：
 * ['.umirc.ts', '.umirc.js', 'config/config.ts', 'config/config.js']
 */
export function getConfigFile(cwd) {
  const files = process.env.UMI_CONFIG_FILE
    ? process.env.UMI_CONFIG_FILE.split(',').filter(v => v && v.trim())
    : ['.umirc.ts', '.umirc.js', 'config/config.ts', 'config/config.js'];
  const validFiles = files.filter(f => existsSync(join(cwd, f)));
  assert(
    validFiles.length <= 1,
    `Multiple config files (${validFiles.join(
      ', ',
    )}) were detected, please keep only one.`,
  );
  return validFiles[0] && join(cwd, validFiles[0]);
}

/**
 * NOTE:
 * 给后缀加前缀，比如:
 * .umirc.js  => .umirc.local.js
 */
export function addAffix(file, affix) {
  const ext = extname(file);
  return file.replace(new RegExp(`${ext}$`), `.${affix}${ext}`);
}

function defaultOnError(e) {
  console.error(e);
}

/**
 * NOTE: 载入文件，类似于 require()
 */
function requireFile(f, opts: IOpts = {}) {
  if (!existsSync(f)) {
    return {};
  }

  const { onError = defaultOnError } = opts;
  let ret: any = {};
  try {
    ret = require(f) || {}; // eslint-disable-line
  } catch (e) {
    onError(e, f);
  }
  // support esm + babel transform
  return ret.default || ret;
}

export function mergeConfigs(...configs): IConfig {
  return extend(true, ...configs);
}

/**
 * NOTE: 读取配置文件内容，会合并默认配置
 * 当指定 UMI_ENV 时，还会合并 .umirc.${UMI_ENV}.js 文件
 * 当开发环境时，还会合并 .umirc.local.js 
 */
export function getConfigByConfigFile(configFile, opts: IOpts = {}): IConfig {
  const umiEnv = process.env.UMI_ENV;
  const isDev = process.env.NODE_ENV === 'development';
  const { defaultConfig, onError } = opts;

  const requireOpts = { onError };
  const configs = [
    defaultConfig,
    requireFile(configFile, requireOpts),
    umiEnv && requireFile(addAffix(configFile, umiEnv), requireOpts),
    isDev && requireFile(addAffix(configFile, 'local'), requireOpts),
  ];
  return mergeConfigs(...configs);
}

/** 
 * NOTE: 返回所有可能的配置文件列表
 */
export function getConfigPaths(cwd): string[] {
  const env = process.env.UMI_ENV;
  return [
    join(cwd, 'config/'),
    join(cwd, '.umirc.js'),
    join(cwd, '.umirc.ts'),
    join(cwd, '.umirc.local.js'),
    join(cwd, '.umirc.local.ts'),
    ...(env ? [join(cwd, `.umirc.${env}.js`), join(cwd, `.umirc.${env}.ts`)] : []),
  ];
}


/**
 * NOTE: 清除配置文件的 require 缓存
 */
export function cleanConfigRequireCache(cwd) {
  const paths = getConfigPaths(cwd);
  Object.keys(require.cache).forEach(file => {
    if (
      paths.some(path => {
        return file.indexOf(path) === 0;
      })
    ) {
      delete require.cache[file];
    }
  });
}

/**
 * NOTE: 获取配置文件内容
 */
export default function(opts: IOpts = {}): IConfig {
  const { cwd, defaultConfig } = opts;
  const absConfigFile = getConfigFile(cwd);

  // 一定要主的 config 文件，UMI_ENV 才会生效
  if (absConfigFile) {
    return getConfigByConfigFile(absConfigFile, {
      defaultConfig,
    });
  } else {
    return {};
  }
}
