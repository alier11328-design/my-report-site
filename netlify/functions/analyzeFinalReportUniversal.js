// netlify/functions/analyzeFinalReportUniversal.js
const OpenAI = require('openai');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { fileBase64, mimeType } = JSON.parse(event.body);
    if (!fileBase64) {
      return { statusCode: 400, body: JSON.stringify({ error: '缺少文件' }) };
    }

    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) throw new Error('未设置 DASHSCOPE_API_KEY 环境变量');

    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    // 定义通用提示词（要求输出 JSON）
    const systemPrompt = `你是一个学业报告助手。根据文件内容，提取以下字段（若没有则留空字符串）。输出必须是纯JSON对象，不要有任何额外解释文字。
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

    // 1. 处理图片
    if (mimeType.startsWith('image/')) {
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
      return { statusCode: 200, body: JSON.stringify(result) };
    }

    // 2. 处理 PDF / Word
    else if (mimeType === 'application/pdf' || mimeType === 'application/msword' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      // 将 Base64 转为 Buffer
      const buffer = Buffer.from(fileBase64, 'base64');
      
      // 上传文件，获取 file_id
      // 注意：openai.files.create 的 file 参数可以是 Buffer，但需要加上 filename
      const fileObject = await openai.files.create({
        file: buffer,
        purpose: 'file-extract',
        filename: `upload.${mimeType === 'application/pdf' ? 'pdf' : 'docx'}`
      });
      const fileId = fileObject.id;

      // 调用 qwen-long 模型
      const completion = await openai.chat.completions.create({
        model: 'qwen-long',
        messages: [
          { role: 'system', content: `请根据文件ID ${fileId} 的内容回答用户的问题。` },
          { role: 'user', content: systemPrompt }
        ],
        max_tokens: 4096,
      });
      const resultText = completion.choices[0].message.content;
      let result = {};
      try {
        let clean = resultText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
        result = JSON.parse(clean);
      } catch (e) {
        console.error('JSON解析失败', resultText);
      }
      return { statusCode: 200, body: JSON.stringify(result) };
    }

    else {
      return { statusCode: 400, body: JSON.stringify({ error: '不支持的文件类型，请上传图片、PDF或Word文档' }) };
    }
  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: JSON.stringify({ error: 'AI 识别失败：' + error.message }) };
  }
};