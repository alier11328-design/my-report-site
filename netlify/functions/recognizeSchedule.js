// netlify/functions/recognizeSchedule.js
const OpenAI = require('openai');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { images } = JSON.parse(event.body);
    if (!images || images.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ rows: [] }) };
    }

    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) throw new Error('未设置 DASHSCOPE_API_KEY 环境变量');

    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    const content = [
      {
        type: 'text',
        text: `你是一个数据提取专家。图片中的排课表格有两种类型，请自动识别并按照以下规则提取数据。

**类型1（课堂管理表格）**：
- 列名包含："课堂名称"、"课堂开始时间"、"课堂结束时间"、"时长(min)"
- 提取字段：courseName（课堂名称），startTime（课堂开始时间），endTime（课堂结束时间），duration（时长(min)的数值，需转换为"XhrYmin"格式）
- 转换规则：分钟数转为小时和分钟，小时向下取整，分钟保留一位小数。例如 255.5 分钟 → 4小时15.5分钟 → "4hr15.5min"；59.2 → "0hr59.2min"。

**类型2（旧格式表格）**：
- 列名包含："名称"、"实际开始"、"实际结束"、"实际时长"
- 提取字段：courseName（名称），startTime（实际开始），endTime（实际结束），duration（实际时长，直接使用，已经是"XhrYmin"格式）

**统一输出格式要求**：
1. 所有 startTime 和 endTime 必须输出完整的 "YYYY-MM-DD HH:MM" 格式。
   - 如果原数据中年份只有两位（如"26-05-26"），请补全为"2026-05-26"。
   - 如果结束时间缺少日期（只有时间），则使用开始时间的日期，并根据时长判断是否跨天（若开始时间较晚且时长较长导致跨天，则日期加1）。
2. duration 统一为 "XhrYmin" 格式（X为整数小时，Y为保留一位小数的分钟）。
3. 按 startTime 从早到晚排序输出。
4. **只输出一个纯 JSON 数组，不要有任何额外文字、注释或 Markdown 标记（如 \`\`\`json ... \`\`\`）**。
5. 如果图片中没有排课信息，返回空数组 []。

**示例输出（类型1）**：
[
  {"courseName": "MGT223", "startTime": "2026-06-05 02:52", "endTime": "2026-06-05 07:26", "duration": "4hr15.5min"},
  {"courseName": "MGT223", "startTime": "2026-06-04 02:57", "endTime": "2026-06-04 08:31", "duration": "5hr25.8min"}
]

**示例输出（类型2）**：
[
  {"courseName": "Review", "startTime": "2026-05-26 05:45", "endTime": "2026-05-26 06:55", "duration": "1hr5.97min"},
  {"courseName": "L3", "startTime": "2026-05-23 01:23", "endTime": "2026-05-23 02:30", "duration": "0hr44.78min"}
]

现在开始分析图片。`
      }
    ];

    for (const base64 of images) {
      content.push({
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${base64}` }
      });
    }

    const response = await openai.chat.completions.create({
      model: 'qwen3-vl-plus',
      messages: [{ role: 'user', content }],
      max_tokens: 8192,   // 已增大到 8192
    });

    const resultText = response.choices[0].message.content;
    let rows = [];
    try {
      // 尝试直接解析
      const parsed = JSON.parse(resultText);
      rows = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      // 如果失败，尝试去除可能的 markdown 标记后解析
      try {
        let cleanText = resultText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
        const parsed = JSON.parse(cleanText);
        rows = Array.isArray(parsed) ? parsed : [];
      } catch (e2) {
        console.error('JSON解析失败', resultText);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ rows })
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: '识别失败：' + error.message })
    };
  }
};