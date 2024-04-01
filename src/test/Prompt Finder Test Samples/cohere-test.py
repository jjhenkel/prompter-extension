import cohere

co = cohere.Client("<<apiKey>>")

response = co.generate(prompt="Please explain to me how LLMs work")
response = co.generate("Please explain to me how LLMs work")

response = co.chat(
    chat_history=[
        {"role": "USER", "message": "Who discovered gravity?"},
        {
            "role": "CHATBOT",
            "message": "The man who is widely credited with discovering gravity is Sir Isaac Newton",
        },
    ],
    message="What year was he born?",
    # perform web search before answering the question. You can also use your own custom connector.
    connectors=[{"id": "web-search"}],
)

text = "paragraph"
response = co.summarize(text=text)
response = co.summarize(text)
