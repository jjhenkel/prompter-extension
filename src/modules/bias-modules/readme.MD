# Evaluation method
These 4 alternatives were evaluated on bho database from paper "“Call me sexist, but...”: Revisiting Sexism Detection Using Psychological Scales and Adversarial Samples". This evaluation can be found under prompt-engineering-modules-for-extension/prompt_encoding_clustering_chatgpt.ipynb in the LLM Testing repository. 

# Evaluation Results
The results of this evaluation are  ( 1 and 2 have very close results, so only 2 was evaluated to save time)


True Positives: 44, False Positives: 360, False Negatives: 5, True Negatives: 590
Accuracy of model 2 is 0.6346346346346347, Recall of model 2 is 0.8979591836734694, F1 score of model 2 is 0.7436751886113406
True Positives: 37, False Positives: 222, False Negatives: 12, True Negatives: 729
Accuracy of model 3 is 0.766, Recall of model 3 is 0.7551020408163265, F1 score of model 3 is 0.7605119811092924
True Positives: 40, False Positives: 256, False Negatives: 9, True Negatives: 695
Accuracy of model 4 is 0.735, Recall of model 4 is 0.8163265306122449, F1 score of model 4 is 0.7735315398276656

prompt 4 has a slight edge, using that for now. 