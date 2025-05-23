import os
import string
import random

def makeFiles(path):
    os.makedirs(path, exist_ok=True)
    for i in range(2):
        filename = f"test{i+1}.txt"
        filepath = os.path.join(path, filename)
        print(f"Creating file {filepath}")
        try:
            with open(filepath, "w") as file:
                random_string = "hello world, welcome to the world of python programming!" 
                file.write(random_string)
                print(f"Created {filename}")
        except Exception as e:
            print(f"Failed to create {filename}: {e}")

if __name__ == "__main__":
    makeFiles("test")
