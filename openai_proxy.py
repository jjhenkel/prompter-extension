from flask import Flask, jsonify
from multiclient import default_client

app = Flask(__name__)


@app.route("/chat/completions", methods=["POST"])
def chat_completions_create():

    response = default_client.chat.completions.create(**request.json)  # type: ignore
    return jsonify(response)


if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True, port=5001)
