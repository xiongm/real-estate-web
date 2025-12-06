
export interface ChunkedUploadOptions {
    url: string; // Base URL (e.g., /api/uploads), endpoints will be appended (/init, /chunk, /complete)
    file: File;
    token?: string;
    projectId: number; // Required for initialization
    onProgress?: (percent: number) => void;
    chunkSize?: number; // bytes, default 512KB
    maxRetries?: number;
    targetType?: 'project_file' | 'document';
}

export async function chunkedUpload(options: ChunkedUploadOptions): Promise<any> {
    const {
        url,
        file,
        token,
        projectId,
        onProgress,
        chunkSize = 512 * 1024,
        maxRetries = 3,
        targetType = 'project_file'
    } = options;

    const totalChunks = Math.ceil(file.size / chunkSize);

    // 1. Init
    const initFormData = new FormData();
    initFormData.append('project_id', projectId.toString());
    initFormData.append('filename', file.name);
    initFormData.append('total_chunks', totalChunks.toString());
    initFormData.append('resource_type', targetType);

    let response = await fetch(`${url}/init`, {
        method: 'POST',
        headers: token ? { 'X-Access-Token': token } : {},
        body: initFormData
    });

    if (!response.ok) {
        throw new Error(`Init failed: ${response.statusText}`);
    }

    const { upload_id } = await response.json();

    // 2. Upload Chunks
    let uploadedBytes = 0;

    for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        const chunkFormData = new FormData();
        chunkFormData.append('upload_id', upload_id);
        chunkFormData.append('chunk_index', i.toString());
        chunkFormData.append('file', chunk, 'chunk'); // 'chunk' filename dummy

        // Retry loop
        let attempts = 0;
        let success = false;

        while (attempts < maxRetries && !success) {
            try {
                const chunkResp = await fetch(`${url}/chunk`, {
                    method: 'POST',
                    headers: token ? { 'X-Access-Token': token } : {},
                    body: chunkFormData
                });

                if (chunkResp.ok) {
                    success = true;
                    uploadedBytes += chunk.size;
                    if (onProgress) {
                        const percent = Math.round((uploadedBytes / file.size) * 100);
                        onProgress(percent);
                    }
                } else {
                    throw new Error(`Chunk ${i} failed: ${chunkResp.statusText}`);
                }
            } catch (err) {
                attempts++;
                console.warn(`Chunk ${i} attempt ${attempts} failed`, err);
                if (attempts >= maxRetries) throw err;
                // Simple backoff
                await new Promise(r => setTimeout(r, 1000 * attempts));
            }
        }
    }

    // 3. Complete
    const compFormData = new FormData();
    compFormData.append('upload_id', upload_id);

    response = await fetch(`${url}/complete`, {
        method: 'POST',
        headers: token ? { 'X-Access-Token': token } : {},
        body: compFormData
    });

    if (!response.ok) {
        throw new Error(`Completion failed: ${response.statusText}`);
    }

    return await response.json();
}
