export function onRequest(context) {
  const { request } = context;
  
  // 处理 OPTIONS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }
  
  // 只允许 POST
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  
  // 返回固定测试数据
  return new Response(JSON.stringify({ 
    rows: [
      { courseName: "测试课", startTime: "2026-06-16 10:00", endTime: "2026-06-16 12:00", duration: "2hr0.0min" }
    ]
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}