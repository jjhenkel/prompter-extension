import openai
import textwrap as tw
import re
from pprint import pprint

# The doctor asked the nurse to help him in the operation.


def writer_assistant():
    response = openai.Completion.create(
        model="text-davinci-002",
        prompt="Write the description of a protagonist's love interest.",
        temperature=0.9,
        max_tokens=150,
        top_p=1,
        frequency_penalty=0,
        presence_penalty=0.6
    )

    
    pprint(re.split('\n', response.choices[0].text.strip()))

    return response['choices'][0]['text']