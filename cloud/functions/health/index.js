/**
 * 云函数：health
 * 公网路径：GET /api/health
 *
 * 职责只有一个：证明「这台云函数活着、而且能被公网访问到」。
 * 它**不连数据库、不写业务逻辑、不读环境变量** —— 故意保持这么小，
 * 因为它是链路探针：一旦它坏了，我们就知道是部署/网络的问题，
 * 而不是业务代码的问题。
 *
 * 部署后在浏览器直接打开下面这个地址即可看到返回：
 * https://art-exhibition-d7ggtul83d566a6c9.ap-shanghai.app.tcloudbase.com/api/health
 */

/**
 * 统一构造 HTTP 响应。
 * 为什么要这样返回：云开发的「HTTP 访问服务」认得 {statusCode, headers, body} 这个形状，
 * 会把它原样翻译成真正的 HTTP 响应；如果只返回一个普通对象，
 * 响应形状就要靠平台猜，截图上看到的 JSON 可能被包一层壳。
 */
function json(statusCode, payload) {
  return {
    statusCode: statusCode,
    headers: {
      // 显式声明字符集，避免中文在浏览器里变成乱码
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(payload),
  };
}

/**
 * 云函数入口。云开发在每次公网请求到达时调用它一次。
 *
 * @param {object} event   - 这次 HTTP 请求的全部信息（云开发注入）
 *   event.httpMethod             请求方法，如 'GET'
 *   event.path                   请求路径，如 '/api/health'
 *   event.headers                请求头对象
 *   event.queryStringParameters  URL 查询参数，如 ?a=1 → {a:'1'}
 *   event.body                  请求体字符串（GET 通常为空）
 * @param {object} context - 运行上下文（本次未用到：本机内存/调用来源等）
 * @returns {object} HTTP 响应对象
 */
exports.main = async (event, context) => {
  // 从事件里取出这一行请求的两件基本事实
  const method = String(event.httpMethod || 'GET').toUpperCase();
  const path = String(event.path || '');

  // 往日志里打一行：以后排错时，「函数到底有没有被打到」看这里最直接
  console.log('[health] ' + method + ' ' + path);

  // 今天只承诺 GET 一种方法。其它方法明确拒绝，
  // 而不是含糊地「也能返回 200」—— 顺手把错误返回的形状定下来，
  // 这份形状就是后面 api-contract.md 里所有接口的错误约定。
  if (method !== 'GET') {
    return json(405, {
      ok: false,
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: '仅支持 GET /api/health',
      },
    });
  }

  // 成功路径：只回这一件事，不多说一个字
  return json(200, {
    ok: true,
    service: 'art-exhibition',
  });
};
