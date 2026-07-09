'use client';

import React, { useState, useEffect } from 'react';
import * as pako from 'pako';

export default function ZeyVaultMain() {
  const [files, setFiles] = useState<any[]>([]);
  const [newFileName, setNewFileName] = useState('');
  const [newFileContent, setNewFileContent] = useState('');
  const [ollamaPrompt, setOllamaPrompt] = useState('');
  const [ollamaResponse, setOllamaResponse] = useState('');
  const [selectedModel, setSelectedModel] = useState('tinyllama');
  const [loading, setLoading] = useState(false);

  const fetchFiles = async () => {
    try {
      const res = await fetch('/api/files');
      const data = await res.json();
      if (data.success) setFiles(data.files);
    } catch (err) {
      console.error('File collection error:', err);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    setLoading(true);
    const formData = new FormData();
    formData.append('file', e.target.files[0]);

    await fetch('/api/files', { method: 'POST', body: formData });
    setLoading(false);
    fetchFiles();
  };

  const handleCreateFile = async () => {
    if (!newFileName) return;
    setLoading(true);
    const formData = new FormData();
    formData.append('filename', newFileName);
    formData.append('content', newFileContent);

    await fetch('/api/files', { method: 'POST', body: formData });
    setNewFileName('');
    setNewFileContent('');
    setLoading(false);
    fetchFiles();
  };

  const handleDelete = async (filename: string) => {
    await fetch('/api/files', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename }),
    });
    fetchFiles();
  };

  const handleCompression = async (filename: string, action: 'zip' | 'unzip') => {
    setLoading(true);
    try {
      const downloadRes = await fetch(`/api/files?filename=${encodeURIComponent(filename)}&download=true`);
      if (!downloadRes.ok) throw new Error('Source fetch failed');
      const inputBytes = new Uint8Array(await downloadRes.arrayBuffer());

      const outputBytes = action === 'zip' ? pako.gzip(inputBytes) : pako.ungzip(inputBytes);
      const outputName = action === 'zip' ? `${filename}.gz` : filename.replace(/\.gz$/, '');

      const formData = new FormData();
      formData.append('file', new File([outputBytes], outputName));

      await fetch('/api/files', { method: 'POST', body: formData });
      fetchFiles();
    } catch (err: any) {
      console.error('Compression pipeline error:', err.message);
    }
    setLoading(false);
  };

  const runOllama = async () => {
    setLoading(true);
    setOllamaResponse('Processing token pipeline...');
    try {
      const res = await fetch('/api/ollama', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: ollamaPrompt, model: selectedModel })
      });
      const data = await res.json();
      setOllamaResponse(data.success ? data.response : `Execution failed: ${data.error}`);
    } catch (err: any) {
      setOllamaResponse(`Network fault: ${err.message}`);
    }
    setLoading(false);
  };

  return (
    <div style={{ fontFamily: 'monospace', padding: '20px', background: '#111', color: '#0f0', minHeight: '100vh' }}>
      <header style={{ borderBottom: '2px solid #0f0', paddingBottom: '10px', marginBottom: '20px' }}>
        <h1 style={{ margin: 0 }}>ZEY VAULT // CLOUD FILE ENGINE (SUPABASE) & REMOTE MODEL BRIDGE</h1>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

        {/* File Management Panel */}
        <div style={{ border: '1px solid #0f0', padding: '15px', background: '#1a1a1a' }}>
          <h2>[1] FILE MATRIX (Supabase Bucket: zey-vault)</h2>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>Upload File / GGUF Model:</label>
            <input type="file" onChange={handleUpload} style={{ background: '#222', color: '#0f0', border: '1px solid #0f0', padding: '5px' }} />
          </div>

          <div style={{ borderTop: '1px dashed #0f0', paddingTop: '10px', marginBottom: '15px' }}>
            <h3>Write New Primitive File</h3>
            <input type="text" placeholder="filename.txt" value={newFileName} onChange={e => setNewFileName(e.target.value)} style={{ width: '100%', background: '#222', color: '#0f0', border: '1px solid #0f0', padding: '5px', marginBottom: '5px' }} />
            <textarea placeholder="File payload contents..." value={newFileContent} onChange={e => setNewFileContent(e.target.value)} style={{ width: '100%', height: '80px', background: '#222', color: '#0f0', border: '1px solid #0f0', padding: '5px', marginBottom: '5px' }} />
            <button onClick={handleCreateFile} style={{ background: '#0f0', color: '#000', border: 'none', padding: '5px 10px', cursor: 'pointer', fontWeight: 'bold' }}>COMMIT TO VAULT</button>
          </div>

          <h3>Active File Registry</h3>
          <ul style={{ listStyleType: 'none', padding: 0 }}>
            {files.map((f, idx) => (
              <li key={idx} style={{ padding: '8px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{f.name} ({f.size} B) {f.isGGUF && <strong style={{ color: '#ff0' }}>[GGUF MODEL]</strong>}</span>
                <div>
                  <button onClick={() => handleCompression(f.name, 'zip')} style={{ background: '#222', color: '#0f0', border: '1px solid #0f0', marginRight: '5px', cursor: 'pointer' }}>ZIP</button>
                  {f.name.endsWith('.gz') && (
                    <button onClick={() => handleCompression(f.name, 'unzip')} style={{ background: '#222', color: '#0f0', border: '1px solid #0f0', marginRight: '5px', cursor: 'pointer' }}>UNZIP</button>
                  )}
                  <button onClick={() => handleDelete(f.name)} style={{ background: '#ff0000', color: '#fff', border: 'none', cursor: 'pointer' }}>DEL</button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* AI Model Execution Panel */}
        <div style={{ border: '1px solid #0f0', padding: '15px', background: '#1a1a1a' }}>
          <h2>[2] OLLAMA CORE INTEGRATION (Remote / Termux)</h2>
          <div style={{ marginBottom: '10px' }}>
            <label>Active Local Model Token: </label>
            <input type="text" value={selectedModel} onChange={e => setSelectedModel(e.target.value)} style={{ background: '#222', color: '#0f0', border: '1px solid #0f0', padding: '3px' }} />
          </div>

          <textarea placeholder="Enter instruction parameters for system model processing..." value={ollamaPrompt} onChange={e => setOllamaPrompt(e.target.value)} style={{ width: '100%', height: '120px', background: '#222', color: '#0f0', border: '1px solid #0f0', padding: '5px', marginBottom: '10px' }} />

          <button onClick={runOllama} disabled={loading} style={{ width: '100%', background: '#0f0', color: '#000', border: 'none', padding: '10px', cursor: 'pointer', fontWeight: 'bold' }}>
            {loading ? 'EXECUTING PIPELINE...' : 'RUN INFERENCE ENGINE'}
          </button>

          <h3 style={{ marginTop: '20px' }}>Output Pipeline Mirror:</h3>
          <pre style={{ background: '#000', padding: '10px', border: '1px dashed #0f0', whiteSpace: 'pre-wrap', minHeight: '150px' }}>
            {ollamaResponse}
          </pre>
        </div>

      </div>
    </div>
  );
                               }
