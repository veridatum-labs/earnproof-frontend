import { appConfig } from "@/config/app";

type ApiClientOptions = RequestInit & {
  path: string;
};

export async function apiClient<TResponse>({
  path,
  headers,
  ...init
}: ApiClientOptions): Promise<TResponse> {
  const response = await fetch(`${appConfig.apiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });

  if (!response.ok) {
    throw new Error(`EarnProof API request failed with ${response.status}`);
  }

  return response.json() as Promise<TResponse>;
}
