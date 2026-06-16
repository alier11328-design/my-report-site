const OpenAI = require('openai');

exports.onRequest = async function(context) {
  const { request, env } = context;

  // 注释掉方法检查，允许所有请求（测试用）
// if (request.method.toUpperCase() !== 'POST') {
//     return new Response('Method Not Allowed', { status: 405 });
// }

  try {
    const { fileBase64, mimeType, pdfText } = await request.json();
    const apiKey = env.DASHSCOPE_API_KEY;
    if (!apiKey) throw new Error('未设置 DASHSCOPE_API_KEY 环境变量');

    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    const systemPrompt = `你是一个学业报告助手。根据提供的内容，提取以下字段（若没有则留空字符串）。输出必须是纯JSON对象，不要有任何额外解释文字。
{
  "reportOverview": "报告概述（总结整体学习情况）",
  "learningGoal": "学习目标回顾（学生最初设定的目标）",
  "achievementSummary": "学习成果总结（达到了什么成果）",
  "finalGrade": "总成绩/等级（如 78分 或 B+）",
  "gradeComment": "成绩评语（对成绩的评价）",
  "teacherMessage": "讲师寄语（老师对学生的寄语）",
  "futureSuggestions": "下学期学习建议",
  "assistantMessage": "教辅寄语",
  "attendanceRate": "出勤率（如 95%）",
  "taskCompletionRate": "任务完成率（如 90%）",
  "interactionRate": "课堂互动率（如 85%）"
}`;

    // 处理图片
    if (fileBase64 && mimeType && mimeType.startsWith('image/')) {
      const content = [
        { type: 'text', text: systemPrompt },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${fileBase64}` } }
      ];
      const response = await openai.chat.completions.create({
        model: 'qwen3-vl-plus',
        messages: [{ role: 'user', content }],
        max_tokens: 4096,
      });
      const resultText = response.choices[0].message.content;
      let result = {};
      try {
        let clean = resultText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
        result = JSON.parse(clean);
      } catch (e) {
        console.error('JSON解析失败', resultText);
      }
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 处理 PDF 文本
    else if (pdfText && pdfText.trim().length > 0) {
      const userMessage = `以下是文档的文本内容：\n\n${pdfText}\n\n请根据以上内容，${systemPrompt}`;
      const response = await openai.chat.completions.create({
        model: 'qwen-long',
        messages: [{ role: 'user', content: userMessage }],
        max_tokens: 4096,
      });
      const resultText = response.choices[0].message.content;
      let result = {};
      try {
        let clean = resultText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
        result = JSON.parse(clean);
      } catch (e) {
        console.error('JSON解析失败', resultText);
      }
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    else {
      return new Response(JSON.stringify({ error: '无效的请求，请提供图片或文本内容' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('函数执行错误:', error);
    return new Response(JSON.stringify({ error: 'AI 识别失败：' + error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}