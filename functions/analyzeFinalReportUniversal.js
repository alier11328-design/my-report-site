export async function onRequest(context) {
  const { request, env } = context;

  try {
    const { fileBase64, mimeType, pdfText } = await request.json();
    const apiKey = env.DASHSCOPE_API_KEY;
    if (!apiKey) throw new Error('未设置 DASHSCOPE_API_KEY 环境变量');

    const baseURL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

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

    // 辅助函数：调用 DashScope API
    async function callDashScope(body) {
      const resp = await fetch(baseURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`DashScope API 返回 ${resp.status}: ${errText}`);
      }
      const json = await resp.json();
      return json;
    }

    // 辅助函数：解析 AI 返回的 JSON 文本
    function parseResultText(resultText) {
      console.log('AI 原始响应:' + ' ' + resultText.substring(0, 200));
      try {
        let clean = resultText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
        return JSON.parse(clean);
      } catch (e) {
        try {
          const startIdx = resultText.indexOf('{');
          const endIdx = resultText.lastIndexOf('}');
          if (startIdx !== -1 && endIdx > startIdx) {
            return JSON.parse(resultText.substring(startIdx, endIdx + 1));
          }
        } catch (e2) {}
        console.error('JSON 解析全部失败', resultText);
        return {};
      }
    }

    // ---- 处理图片 ----
    if (fileBase64 && mimeType && mimeType.startsWith('image/')) {
      const body = {
        model: 'qwen3-vl-plus',
        messages: [{
        role: 'user',
          content: [
            { type: 'text', text: systemPrompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${fileBase64}` } },
          ],
        }],
        max_tokens: 4096,
      };
      const result = await callDashScope(body);
      console.log('API 响应结构:' + JSON.stringify(Object.keys(result)));
      console.log('choices 类型:' + typeof result.choices);
      const resultText = (result.choices && result.choices[0] && result.choices[0].message && typeof result.choices[0].message.content === 'string') ? result.choices[0].message.content : '';
      const parsed = parseResultText(resultText);
      return new Response(JSON.stringify(Object.assign(parsed, { _debugRawLength: resultText.length, _debugRawPreview: resultText.substring(0, 100) })), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ---- 处理 PDF 文本 ----
    else if (pdfText && pdfText.trim().length > 0) {
      const body = {
        model: 'qwen-long',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: '以下是文档的文本内容：\n\n' + pdfText + '\n\n请根据以上内容提取上述JSON字段。' }
        ],
        max_tokens: 4096,
      };
      const result = await callDashScope(body);
      console.log('API 响应结构:' + JSON.stringify(Object.keys(result)));
      console.log('choices 类型:' + typeof result.choices);
      const resultText = (result.choices && result.choices[0] && result.choices[0].message && typeof result.choices[0].message.content === 'string') ? result.choices[0].message.content : '';
      const parsed = parseResultText(resultText);
      return new Response(JSON.stringify(Object.assign(parsed, { _debugRawLength: resultText.length, _debugRawPreview: resultText.substring(0, 100) })), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ---- 无效请求 ----
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
