// netlify/functions/recognizeSchedule.js
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

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error('未设置 DEEPSEEK_API_KEY 环境变量');
    }

    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://api.deepseek.com/v1',
    });

    const content = [
      {
        type: 'text',
        text: '你是一个OCR助手。请提取图片中的名称、实际开始、实际结束、实际时长这4个数据，按顺序输出并填充到报告中。'
      }
    ];
    for (const base64 of images) {
      content.push({
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${base64}` }
      });
    }

    const response = await openai.chat.completions.create({
      model: 'deepseek-chat',   // DeepSeek 支持图像识别的模型
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