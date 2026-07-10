'use client';

import React, { useState, useEffect, useRef } from 'react';
import * as pako from 'pako';

type Notice = { type: 'success' | 'error'; message: string };

export default function ZeyVaultMain() {
  const [files, setFiles] = useState<any[]>([]);
  const [newFileName, setNewFileName] = useState('');
  const [newFileContent, setNewFileContent] = useState('');
  const [ollamaPrompt, setOllamaPrompt] = useState('');
  const [ollamaResponse, setOllamaResponse] = useState('');
  const [selectedModel, setSelectedModel] = useState('tinyllama');
  const [loading, setLoading] = useState(false);
  const [busyFile, setBusyFile] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notice | null>(null);
  const notifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = (type: Notice['type'], message: string) => {
    setNotification({ type, message });
    if (notifyTimer.current) clearTimeout(notifyTimer.current);
    notifyTimer.current = setTimeout(() => setNotification(null), 4000);
  };

  const fetchFiles = async () => {
    try {
      const res = await fetch('/api/files');
      const data = await res.json();
      if (data.success) setFiles(data.files);
      else notify('error', data.error || 'Failed to load file registry');
    } catch (err: any) {
      notify('error', `File collection error: ${err.message}`);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', selected);

      const res = await fetch('/api/files', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `Upload failed (${res.status})`);
      notify('success', data.message || `${selected.name} uploaded`);
      await fetchFiles();
    } catch (err: any) {
      notify('error', err.message);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleCreateFile = async () => {
    const trimmedName = newFileName.trim();
    if (!trimmedName) {
      notify('error', 'Filename is required');
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('filename', trimmedName);
      formData.append('content', newFileContent);

      const res = await fetch('/api/files', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `Write failed (${res.status})`);
      notify('success', data.message || `${trimmedName} written`);
      setNewFileName('');
      setNewFileContent('');
      await fetchFiles();
    } catch (err: any) {
      notify('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (filename: string) => {
    setBusyFile(filename);
    try {
      const res = await fetch('/api/files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `Delete failed (${res.status})`);
      notify('success', data.message || `${filename} deleted`);
      await fetchFiles();
    } catch (err: any) {
      notify('error', err.message);
    } finally {
      setBusyFile(null);
    }
  };

  const handleCompression = async (filename: string, action: 'zip' | 'unzip') => {
    setBusyFile(filename);
    try {
      const downloadRes = await fetch(`/api/files?filename=${encodeURIComponent(filename)}&download=true`);
      if (!downloadRes.ok) throw new Error(`Could not fetch ${filename} for compression`);
      const inputBytes = new Uint8Array(await downloadRes.arrayBuffer());

      const outputBytes = action === 'zip' ? pako.gzip(inputBytes) : pako.ungzip(inputBytes);
      const outputName = action === 'zip' ? `${filename}.gz` : filename.replace(/\.gz$/, '');

      const formData = new FormData();
      formData.append('file', new File([outputBytes], outputName));

      const uploadRes = await fetch('/api/files', { method: 'POST', body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.success) throw new Error(uploadData.error || 'Compressed upload failed');

      notify('success', action === 'zip' ? `Compressed to ${outputName}` : `Decompressed to ${outputName}`);
      await fetchFiles();
    } catch (err: any) {
      notify('error', `Compression pipeline error: ${err.message}`);
    } finally {
      setBusyFile(null);
    }
  };

  const runOllama = async () => {
    if (!ollamaPrompt.trim()) {
      notify('error', 'Enter a prompt first');
      return;
    }
    setLoading(true);
    setOllamaResponse('Processing token pipeline...');
    try {
      const res = await fetch('/api/ollama', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: ollamaPrompt, model: selectedModel })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `Ollama request failed (${res.status})`);
      setOllamaResponse(data.response);
      notify('success', 'Inference complete');
    } catch (err: any) {
      setOllamaResponse(`Execution failed: ${err.message}`);
      notify('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ fontFamily: 'monospace', padding: '20px', background: '#111', color: '#0f0', minHeight: '100vh' }}>
      <style>{`
        @keyframes zv-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .zv-spinner {
          display: inline-block;
          width: 12px;
          height: 12px;
          border: 2px solid currentColor;
          border-top-color: transparent;
          border-radius: 50%;
          animation: zv-spin 0.6s linear infinite;
          vertical-align: middle;
        }
      `}</style>

      {notification && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          padding: '12px 16px',
          background: notification.type === 'success' ? '#0f0' : '#ff3333',
          color: notification.type === 'success' ? '#000' : '#fff',
          border: '1px solid #000',
          fontWeight: 'bold',
          zIndex: 1000,
          maxWidth: '320px',
          boxShadow: '0 0 12px rgba(0,0,0,0.6)',
        }}>
          {notification.type === 'success' ? '✓ ' : '✗ '}{notification.message}
        </div>
      )}

      <header style={{ borderBottom: '2px solid #0f0', paddingBottom: '10px', marginBottom: '20px' }}>
        <h1 style={{ margin: 0 }}>ZEY VAULT // CLOUD FILE ENGINE (SUPABASE) & REMOTE MODEL BRIDGE</h1>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

        {/* File Management Panel */}
        <div style={{ border: '1px solid #0f0', padding: '15px', background: '#1a1a1a' }}>
          <h2>[1] FILE MATRIX (Supabase Bucket: zey-vault)</h2>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>
              Upload File / GGUF Model: {loading && <span className="zv-spinner" />}
            </label>
            <input type="file" onChange={handleUpload} disabled={loading} style={{ background: '#222', color: '#0f0', border: '1px solid #0f0', padding: '5px' }} />
          </div>

          <div style={{ borderTop: '1px dashed #0f0', paddingTop: '10px', marginBottom: '15px' }}>
            <h3>Write New Primitive File</h3>
            <input type="text" placeholder="filename.txt" value={newFileName} onChange={e => setNewFileName(e.target.value)} disabled={loading} style={{ width: '100%', background: '#222', color: '#0f0', border: '1px solid #0f0', padding: '5px', marginBottom: '5px' }} />
            <textarea placeholder="File payload contents..." value={newFileContent} onChange={e => setNewFileContent(e.target.value)} disabled={loading} style={{ width: '100%', height: '80px', background: '#222', color: '#0f0', border: '1px solid #0f0', padding: '5px', marginBottom: '5px' }} />
            <button onClick={handleCreateFile} disabled={loading} style={{ background: '#0f0', color: '#000', border: 'none', padding: '5px 10px', cursor: loading ? 'default' : 'pointer', fontWeight: 'bold', opacity: loading ? 0.6 : 1 }}>
              {loading ? <span className="zv-spinner" /> : 'COMMIT TO VAULT'}
            </button>
          </div>

          <h3>Active File Registry</h3>
          <ul style={{ listStyleType: 'none', padding: 0 }}>
            {files.map((f, idx) => {
              const isBusy = busyFile === f.name;
              return (
                <li key={idx} style={{ padding: '8px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: isBusy ? 0.5 : 1 }}>
                  <span>{f.name} ({f.size} B) {f.isGGUF && <strong style={{ color: '#ff0' }}>[GGUF MODEL]</strong>}</span>
                  <div>
                    {isBusy ? (
                      <span className="zv-spinner" style={{ marginRight: '8px' }} />
                    ) : (
                      <>
                        <button onClick={() => handleCompression(f.name, 'zip')} disabled={busyFile !== null} style={{ background: '#222', color: '#0f0', border: '1px solid #0f0', marginRight: '5px', cursor: 'pointer' }}>ZIP</button>
                        {f.name.endsWith('.gz') && (
                          <button onClick={() => handleCompression(f.name, 'unzip')} disabled={busyFile !== null} style={{ background: '#222', color: '#0f0', border: '1px solid #0f0', marginRight: '5px', cursor: 'pointer' }}>UNZIP</button>
                        )}
                        <button onClick={() => handleDelete(f.name)} disabled={busyFile !== null} style={{ background: '#ff0000', color: '#fff', border: 'none', cursor: 'pointer' }}>DEL</button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
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

          <button onClick={runOllama} disabled={loading} style={{ width: '100%', background: '#0f0', color: '#000', border: 'none', padding: '10px', cursor: loading ? 'default' : 'pointer', fontWeight: 'bold', opacity: loading ? 0.6 : 1 }}>
            {loading ? <span className="zv-spinner" /> : 'RUN INFERENCE ENGINE'}
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
