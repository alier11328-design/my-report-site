// netlify/functions/recognizeSchedule.js 和 recognizeFeedback.js 内容相同
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
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', // 千问兼容接口
    });

    // 构建消息：要求 AI 提取图片中的所有文字
    const content = [
      {
        type: 'text',
        text: '请提取并输出这张图片中的所有文字内容，不需要任何额外解释，直接输出文字本身。'
      }
    ];
    for (const base64 of images) {
      content.push({
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${base64}` }
      });
    }

    const response = await openai.chat.completions.create({
      model: 'qwen3-vl-plus',   // 你购买的模型
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