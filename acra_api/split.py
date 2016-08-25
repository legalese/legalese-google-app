import json
import sys

f = open('/path/to/json', 'r')
h = json.load(f)

'''
for i in h["UEN_DATAGOV"]["BODY"][0]["DATA"]:
    if i["ENTITY_NAME"][0] == "LEGALESE PTE. LTD.":
        print i["ENTITY_NAME"][0]
        print i["UEN"][0]
'''
# note that my parser prints the key values into a single-element array

chunkSize = 4550
with o as h["UEN_DATAGOV"]["BODY"][0]["DATA"]:
    for i in xrange(0, len(o), chunkSize):
        with open('uen' + '_' + str(i//chunkSize) + '.json', 'w') as outfile:
            json.dump(o[i:i+chunkSize], outfile)
