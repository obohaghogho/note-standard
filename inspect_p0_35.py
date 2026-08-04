import docx

doc = docx.Document("temp_anchor_source/Updated Standard Service Agreement (2).docx")
for i in range(35):
    print(f"Para {i:2d}: '{doc.paragraphs[i].text}'")
