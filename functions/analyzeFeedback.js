const OpenAI = require('openai');

exports.onRequest = async function(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { images, studentName = '该学生', courseName = '课程' } = await request.json();
    if (!images || images.length === 0) {
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const apiKey = env.DASHSCOPE_API_KEY;
    if (!apiKey) throw new Error('未设置 DASHSCOPE_API_KEY 环境变量');

    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    const content = [
      {
        type: 'text',
        text: `你是一位专业的学业反馈顾问，目前正在辅导一位名叫“${studentName}”的学生，科目是“${courseName}”。你的任务是根据用户提供的图片内容，以JSON格式输出学习情况综合分析。请严格遵循以下三点：
        
1. **智能判断**：图片内容可能有两种情况：一是用户已写好的课堂表现、辅导进度、掌握情况和学习建议；二是学习纪要和笔记。
    - **情况A（直接优化）**：若包含明确的四项字段，请在保留原意的基础上进行细节丰富和语言精炼，使其更专业、更具建设性。
    - **情况B（纪要分析）**：若为长篇纪要，请深入分析全文，提取关键信息并组织成结构化的反馈。

2. **严格按以下JSON格式输出，不要输出任何其他解释文字**：
{
  "performance": "描述学生的平时课堂表现",
  "progress": "描述当前的辅导进度概述",
  "mastery": "描述课程的掌握情况分析",
  "suggestion": "提供后续的学习建议"
}

3. **撰写标准**：必须使用乐观、鼓励、专业、正式的口吻，面向学生和家长，展现对学生潜力的认可。每段内容控制在 150 字以内，中文撰写。`
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
    let result = {};
    try {
      result = JSON.parse(resultText);
    } catch (e) {
      console.error(e);
    }
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: 'AI 识别失败' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}