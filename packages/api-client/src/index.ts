/**
 * API Client - Typed HTTP client
 */

export interface ApiClientOptions {
  baseURL: string;
  timeout?: number;
}

export class ApiClient {
  private baseURL: string;
  private timeout: number;

  constructor(options: ApiClientOptions) {
    this.baseURL = options.baseURL;
    this.timeout = options.timeout || 30000;
  }

  private async request<T>(
    method: string,
    path: string,
    data?: unknown
  ): Promise<T> {
    const url = `${this.baseURL}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: data ? JSON.stringify(data) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response.json() as Promise<T>;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  post<T>(path: string, data: unknown): Promise<T> {
    return this.request<T>('POST', path, data);
  }

  put<T>(path: string, data: unknown): Promise<T> {
    return this.request<T>('PUT', path, data);
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
}
