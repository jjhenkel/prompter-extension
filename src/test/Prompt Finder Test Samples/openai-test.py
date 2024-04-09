from openai import OpenAI

client = OpenAI()
client.chat.completions.create(
    messages=[{"role": "user", "content": "hello"}], max_tokens=50
)
client.completions.create(prompt="hi")
