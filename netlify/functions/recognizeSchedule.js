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
        text: `你是一个数据提取专家。图片中可能包含两种类型的排课表格，请智能识别并提取所需字段：

**类型A（旧格式）**：表格包含“课程名称”或“课堂名称”、“实际开始”、“实际结束”、“实际时长”等列。  
提取字段：courseName, startTime, endTime, duration（duration直接使用原值，如"1hr26.72min"）。

**类型B（新格式）**：表格包含“课堂名称”、“课堂开始时间”、“课堂结束时间”、“时长(min)”等列。  
提取字段：courseName（课堂名称），startTime（课堂开始时间），endTime（课堂结束时间）。  
注意：duration需要将“时长(min)”列的数值（如255.5）换算为 "XhrYmin" 格式，其中X为小时数（向下取整），Y为剩余分钟数（保留一位小数）。例如：
- 255.5分钟 → 4小时 + 15.5分钟 → "4hr15.5min"
- 59.2分钟 → 0小时 + 59.2分钟 → "0hr59.2min"

**通用要求**：
1. **日期格式统一**：startTime 和 endTime 都必须输出完整的 "YYYY-MM-DD HH:MM" 格式。
   - 如果原表格中结束时间只提供了时分（如 "07:26"），请根据开始时间和时长（或常识）推断出正确的日期。一般情况下，结束时间与开始时间同一天，除非开始时间很晚且时长较长导致跨天。
   - 示例：开始时间 "2026-06-05 02:52"，时长 4小时15.5分钟 → 结束时间应为 "2026-06-05 07:07.5"？不对，分钟应为整数？根据实际：02:52 + 4h15.5min = 07:07.5，但表格中通常为 "07:07" 或 "07:08"，可近似取整。为简化，可以保留原始表格中的结束时间字符串，但补充日期部分。最好让 AI 计算精确的结束时间（日期+时间）。
   - 为了稳定，建议：如果表格中结束时间已有完整日期时间，直接使用；如果只有时间，则使用开始时间的日期，并计算出时间。如果计算复杂，可要求 AI 输出与开始时间相同的日期（除非明显跨天）。
   - 更简单可靠的方法：要求 AI 输出的 endTime 包含日期，格式与 startTime 一致。如果原表格结束时间没有日期，则默认与开始时间同一天，并按时分输出。AI 可以计算跨天情况（例如开始 23:00，时长 2h，结束时间应为第二天 01:00，日期+1）。

2. **按 startTime 从早到晚排序输出**。
3. **只输出一个 JSON 数组**，不要有任何额外文字。
4. 如果图片中没有任何课程信息，返回空数组 []。

**示例输出（类型A，结束时间包含完整日期）**：
[
  {"courseName": "L2", "startTime": "2026-06-09 15:57", "endTime": "2026-06-09 17:35", "duration": "1hr26.72min"},
  {"courseName": "L1", "startTime": "2026-06-08 18:04", "endTime": "2026-06-08 19:15", "duration": "0hr10.48min"}
]

**示例输出（类型B，结束时间也补全日期）**：
[
  {"courseName": "MGT223", "startTime": "2026-06-05 02:52", "endTime": "2026-06-05 07:26", "duration": "4hr15.5min"},
  {"courseName": "MGT223", "startTime": "2026-06-04 02:57", "endTime": "2026-06-04 08:31", "duration": "5hr25.8min"}
]

注意：如果结束时间跨天，请正确增加日期。例如开始 "2026-06-01 23:00"，时长 2 小时，则结束时间为 "2026-06-02 01:00"。`
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
      max_tokens: 4096,
    });

    const resultText = response.choices[0].message.content;
    let rows = [];
    try {
      const parsed = JSON.parse(resultText);
      rows = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('JSON解析失败', resultText);
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