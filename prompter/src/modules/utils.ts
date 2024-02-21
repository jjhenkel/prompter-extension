import OpenAI from "openai";

export function getClient(
) {
    if (process.env.AZURE_OPENAI_ENDPOINT === undefined) {
        console.error("AZURE_OPENAI_ENDPOINT is undefined");
    } else {
        const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
        if (process.env.AZURE_OPENAI_API_KEY === undefined) {
            console.error("AZURE_OPENAI_API_KEY is undefined");
        } else {
            const credential = process.env.AZURE_OPENAI_API_KEY;
            let client = new OpenAI({
                apiKey: credential,
                baseURL: endpoint + "openai/deployments/gpt-35-turbo",
                defaultQuery: { 'api-version': "2023-05-15" },
                defaultHeaders: { 'api-key': credential },

            });
            return client;
        }
    }
}

