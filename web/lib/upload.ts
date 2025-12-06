

export interface UploadOptions {
    url: string;
    file: File;
    token?: string;
    onProgress?: (percent: number) => void;
    maxSizeMB?: number;
    timeoutMs?: number;
    additionalFields?: Record<string, string>;
}

export function uploadFile<T = any>({
    url,
    file,
    token,
    onProgress,
    maxSizeMB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB) || 10,
    timeoutMs = Number(process.env.NEXT_PUBLIC_UPLOAD_TIMEOUT_MS) || 60000,
    additionalFields,
}: UploadOptions): Promise<T> {
    return new Promise((resolve, reject) => {
        if (file.size > maxSizeMB * 1024 * 1024) {
            return reject(new Error(`File size exceeds the limit of ${maxSizeMB}MB`));
        }

        const xhr = new XMLHttpRequest();
        xhr.open('POST', url);
        xhr.timeout = timeoutMs;

        if (token) {
            xhr.setRequestHeader('X-Access-Token', token);
        }

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && onProgress) {
                const percent = Math.round((event.loaded / event.total) * 100);
                onProgress(percent);
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    resolve(response);
                } catch {
                    resolve(xhr.responseText as unknown as T);
                }
            } else {
                let errorMessage = xhr.statusText || `Upload failed with status ${xhr.status}`;
                try {
                    const errorJson = JSON.parse(xhr.responseText);
                    if (errorJson?.detail) errorMessage = errorJson.detail;
                    else if (errorJson?.message) errorMessage = errorJson.message;
                    else if (errorJson?.error) errorMessage = errorJson.error;
                } catch { }
                reject(new Error(errorMessage));
            }
        };

        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.ontimeout = () => reject(new Error('Upload timed out'));

        const formData = new FormData();
        formData.append('file', file);
        if (additionalFields) {
            Object.entries(additionalFields).forEach(([key, value]) => {
                formData.append(key, value);
            });
        }

        xhr.send(formData);
    });
}
