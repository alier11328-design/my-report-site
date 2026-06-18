export async function onRequest(context) {
  const { request, env } = context;
  try {
    const { fileBase64, mimeType, pdfText } = await request.json();
    const apiKey = env.DASHSCOPE_API_KEY;
    if (!apiKey) throw new Error('未设置 DASHSCOPE_API_KEY 环境变量');

    const NATIVE_API = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';
    
    const systemPrompt = '你是一个学业报告助手。根据提供的内容，提取以下字段（若没有则留空字符串）。输出必须是纯JSON对象，不要有任何额外解释文字。\n{\n  "reportOverview": "报告概述（总结整体学习情况）",\n  "learningGoal": "学习目标回顾（学生最初设定的目标）",\n  "achievementSummary": "学习成果总结（达到了什么成果）",\n  "finalGrade": "总成绩/等级（如 78分 或 B+）",\n  "gradeComment": "成绩评语（对成绩的评价）",\n  "teacherMessage": "讲师寄语（老师对学生的寄语）",\n  "futureSuggestions": "下学期学习建议",\n  "assistantMessage": "教辅寄语",\n  "attendanceRate": "出勤率（如 95%）",\n  "taskCompletionRate": "任务完成率（如 90%）",\n  "interactionRate": "课堂互动率（如 85%）"\n}';

    async function callDashScopeNative(modelName, msgList) {
      const resp = await fetch(NATIVE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({ model: modelName, input: { messages: msgList }, parameters: { max_tokens: 4096, result_format: 'message' } })
      });
      if (!resp.ok) { const errText = await resp.text(); throw new Error('DashScope 返回 ' + resp.status + ': ' + errText); }
      const json = await resp.json();
      if (!json.output || !json.output.choices || !json.output.choices[0]) throw new Error('API 响应格式异常: ' + JSON.stringify(json));
      return json.output.choices[0].message.content || '';
    }

    function parseResultText(t) {
      if (!t || t.trim() === '') { console.log('AI 响应为空,返回默认对象'); return {}; }
      try { return JSON.parse(t.replace(/```json\s*/g,'').replace(/```\s*/g,'')); } catch (e) {
        try { var a=t.indexOf('{'),b=t.lastIndexOf('}'); if(a>-1&&b>a) return JSON.parse(t.substring(a,b+1)); } catch(e2){}
        return {};
      }
    }

    if (fileBase64 && mimeType && mimeType.startsWith('image/')) {
      var r = await callDashScopeNative('qwen3-vl-plus', [{role:'system',content:systemPrompt},{role:'user',content:'请分析图片内容并提取JSON字段'}]);
      return new Response(JSON.stringify(Object.assign(parseResultText(r),{_dbg:r.substring(0,100)})),{status:200,headers:{'Content-Type':'application/json'}});
    }

    else if (pdfText && pdfText.trim().length > 0) {
      var r = await callDashScopeNative('qwen-max', [{role:'system',content:systemPrompt},{role:'user',content:'以下是文档的文本内容：\n' + pdfText + '\n\n请根据以上内容提取上述JSON字段。'}]);
      return new Response(JSON.stringify(Object.assign(parseResultText(r),{_dbg:r.substring(0,100)})),{status:200,headers:{'Content-Type':'application/json'}});
    }

    else { return new Response(JSON.stringify({error:'无效请求'}),{status:400,headers:{'Content-Type':'application/json'}}); }
  } catch (error) {
    console.error('函数错误:', error);
    return new Response(JSON.stringify({error:'AI 识别失败：' + error.message}),{status:500,headers:{'Content-Type':'application/json'}});
  }
}