const OpenAI = require('openai');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { images } = JSON.parse(event.body);
    if (!images || images.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ text: "" }) };
    }

    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      throw new Error('未设置 DASHSCOPE_API_KEY 环境变量');
    }

    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    const content = [
      {
        type: 'text',
        text: `你是一个数据提取专家。图片中的表格包含多列信息（预计开始、预计结束、预计时长、实际开始、实际结束、实际时长等）。请只提取每一行的以下四个字段：
- courseName：课程名称（如 L1, L2）
- startTime：实际开始时间（格式 YYYY-MM-DD HH:MM，例如 2026-06-09 15:57）
- endTime：实际结束时间（格式 HH:MM，例如 17:35）
- duration：实际时长（格式 HH:MM:SS，例如 01:26:43）

注意：如果日期缺失，请根据上下文或表格中的日期推断；如果推断不出，使用最近的日期。

要求：
1. 只输出一个 JSON 数组，不要有任何额外文字。
2. 按实际开始时间（startTime）从早到晚排序。
3. 不要包含预计时间的字段。

示例输出：
[
  {"courseName": "L1", "startTime": "2026-06-08 18:04", "endTime": "19:15", "duration": "01:11:00"},
  {"courseName": "L2", "startTime": "2026-06-09 15:57", "endTime": "17:35", "duration": "01:26:43"}
]`
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

    const extractedText = response.choices[0].message.content;

    return {
      statusCode: 200,
      body: JSON.stringify({ text: extractedText })
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: '识别失败：' + error.message })
    };
  }
};