const TYPE_MAP = {
  java: { label: 'Java', color: '#f89820' },
  py: { label: 'Python', color: '#3776ab' },
  c: { label: 'C', color: '#5c6bc0' },
  cpp: { label: 'C++', color: '#00599c' },
  h: { label: 'Header', color: '#7986cb' },
  html: { label: 'HTML', color: '#e34c26' },
  css: { label: 'CSS', color: '#2965f1' },
  js: { label: 'JavaScript', color: '#f0db4f' },
  json: { label: 'JSON', color: '#8bc34a' },
  pdf: { label: 'PDF', color: '#e53935' },
  doc: { label: 'DOCX', color: '#2b579a' },
  docx: { label: 'DOCX', color: '#2b579a' },
  ppt: { label: 'PPT', color: '#d24726' },
  pptx: { label: 'PPT', color: '#d24726' },
  zip: { label: 'ZIP', color: '#ffca28' },
  rar: { label: 'RAR', color: '#8d6e63' },
  png: { label: 'Image', color: '#26a69a' },
  jpg: { label: 'Image', color: '#26a69a' },
  jpeg: { label: 'Image', color: '#26a69a' },
  gif: { label: 'Image', color: '#26a69a' },
  mp4: { label: 'Video', color: '#ab47bc' },
  mov: { label: 'Video', color: '#ab47bc' },
  sql: { label: 'SQL', color: '#00758f' },
  md: { label: 'Markdown', color: '#607d8b' },
  txt: { label: 'Text', color: '#90a4ae' },
};

function getTypeInfo(extension) {
  const ext = (extension || '').replace('.', '').toLowerCase();
  return TYPE_MAP[ext] || { label: ext ? ext.toUpperCase() : 'File', color: '#78909c' };
}

module.exports = { TYPE_MAP, getTypeInfo };
