import os
import openai
import config
import textwrap as tw
import re
from pprint import pprint
import key


def product_observation(prompt_product_desc):
    print("Running product observation")
    system_prompt = {
        "role":"system",
        "content":"The following is a conversation with an AI Customer Segment Recommender for a flower shop."
    }
    prompt_seller_persona = "the  owner"
    response = openai.Completion.create(
        model="text-davinci-002",
        # trained responses
        prompt="The following is a conversation with an AI Customer Segment Recommender. \
        The AI is insightful, verbose, and wise, and cares a lot about finding the product market fit.  \
        What are the top 5 types of customer should a seller who is " + prompt_seller_persona + \
        " sell " + prompt_product_desc + " to?",
        temperature=0.9,
        max_tokens=150,
        top_p=1,
        frequency_penalty=0,
        presence_penalty=0.6
        #stop=[" Human:", " AI:"]
    )

    pprint(re.split('\n', response.choices[0].text.strip()))

    return response['choices'][0]['text']