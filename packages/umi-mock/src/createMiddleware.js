import { basename, join } from 'path';
import chokidar from 'chokidar';
import signale from 'signale';
import { winPath } from 'umi-utils';
import matchMock from './matchMock';
import getMockData from './getMockData';
import getPaths from './getPaths';

const debug = require('debug')('umi-mock:createMiddleware');

function noop() {}

// NOTE:
// 返回一个 middleware 的函数，供 app.use()
// 这里使用了闭包：
// 在 middleware 函数外，有个 mockData 的变量，保存 mock 文件里解析出来的数据
// 监听 mock 目录下的文件，有更新就重新获取 mock 数据存在 mockData 变量中
// middleware 会检测当前请求有没有匹配 mockData 中的路径，匹配了就输出数据
// 这样能做到实时更新数据，不用重启服务器

export default function(opts = {}) {
  const {
    cwd,
    errors,
    config,
    absPagesPath,
    absSrcPath,
    watch,
    onStart = noop,
  } = opts;
  const { absMockPath, absConfigPath, absConfigPathWithTS } = getPaths(cwd);
  const mockPaths = [absMockPath, absConfigPath, absConfigPathWithTS];
  const paths = [
    ...mockPaths,
    basename(absSrcPath) === 'src' ? absSrcPath : absPagesPath,
  ];
  let mockData = null;

  // registerBabel 和 clean require cache 包含整个 src 目录
  // 而 watch 只包含 pages/**/_mock.[jt]s
  onStart({ paths });
  fetchMockData();

  if (watch) {
    // chokidar 在 windows 下使用反斜杠组成的 glob 无法正确 watch 文件变动
    // ref: https://github.com/paulmillr/chokidar/issues/777
    const absPagesGlobPath = winPath(join(absPagesPath, '**/_mock.[jt]s'));
    // NOTE: 监听文件变化
    const watcher = chokidar.watch([...mockPaths, absPagesGlobPath], {
      ignoreInitial: true,
    });
    watcher.on('all', (event, file) => {
      debug(`[${event}] ${file}, reload mock data`);
      errors.splice(0, errors.length);
      // NOTE: 要清除 require 缓存
      cleanRequireCache();
      fetchMockData();
      if (!errors.length) {
        signale.success(`Mock files parse success`);
      }
    });
  }

  // NOTE: 清除 mock 文件的 require 缓存
  function cleanRequireCache() {
    Object.keys(require.cache).forEach(file => {
      if (
        paths.some(path => {
          return file.indexOf(path) > -1;
        })
      ) {
        delete require.cache[file];
      }
    });
  }

  // NOTE: 取 mock 数据，数据已经整理过
  function fetchMockData() {
    mockData = getMockData({
      cwd,
      config,
      absPagesPath,
      onError(e) {
        errors.push(e);
      },
    });
  }

  // NOTE: 返回一个 middleware，供 app.use() 使用
  return function UMI_MOCK(req, res, next) {
    // NOTE: 
    // 检测当前 req 是否匹配 mockData 中配置的路径
    // 若能匹配，则发送对应的数据，不匹配则调用 next() 执行后面的操作
    const match = mockData && matchMock(req, mockData);
    if (match) {
      debug(`mock matched: [${match.method}] ${match.path}`);
      // NOTE: match.handler 是 middleware，这里没有给 app.use() 使用，而是直接传入参数调用
      return match.handler(req, res, next);
    } else {
      return next();
    }
  };
}
