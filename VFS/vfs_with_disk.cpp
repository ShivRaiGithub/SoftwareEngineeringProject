#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include <unordered_map>
#include <cstring>
#include <sstream>
using namespace std;

const int MAX_FILES = 1000;
const int FILE_SIZE = 1024;
const int DISK_SIZE = MAX_FILES * FILE_SIZE;
const string DISK_NAME = "vfs_disk.img";

struct Inode {
    char fileName[100];
    int startBlock;
    int size;
    int cursor; // File pointer support
    bool used;
};

vector<Inode> inodeTable(MAX_FILES);
vector<char> diskData(DISK_SIZE, 0);

// ============ Disk IO ============
void LoadDisk() {
    ifstream fin(DISK_NAME, ios::binary);
    if (fin) {
        fin.read(reinterpret_cast<char*>(&inodeTable[0]), sizeof(Inode) * MAX_FILES);
        fin.read(&diskData[0], DISK_SIZE);
        fin.close();
    }
}

void SaveDisk() {
    ofstream fout(DISK_NAME, ios::binary);
    fout.write(reinterpret_cast<const char*>(&inodeTable[0]), sizeof(Inode) * MAX_FILES);
    fout.write(&diskData[0], DISK_SIZE);
    fout.close();
}

int FindFreeInode() {
    for (int i = 0; i < MAX_FILES; ++i) {
        if (!inodeTable[i].used) return i;
    }
    return -1;
}

int FindFreeBlock() {
    for (int i = 0; i < MAX_FILES; ++i) {
        if (!inodeTable[i].used) return i * FILE_SIZE;
    }
    return -1;
}

int FindFile(const string& name) {
    for (int i = 0; i < MAX_FILES; ++i) {
        if (inodeTable[i].used && name == inodeTable[i].fileName) return i;
    }
    return -1;
}

// ============ File Operations ============

void CreateFile(const string& name) {
    if (FindFile(name) != -1) {
        cout << "Error: File already exists.\n";
        return;
    }
    int idx = FindFreeInode();
    int block = FindFreeBlock();
    if (idx == -1 || block == -1) {
        cout << "Error: Disk full or inode table full.\n";
        return;
    }
    strncpy(inodeTable[idx].fileName, name.c_str(), 99);
    inodeTable[idx].fileName[99] = '\0'; // Ensure null termination
    inodeTable[idx].startBlock = block;
    inodeTable[idx].size = 0;
    inodeTable[idx].cursor = 0;
    inodeTable[idx].used = true;
    SaveDisk();
    cout << "File created.\n";
    SaveDisk();

}

string base64_encode(const string& input) {
    static const string base64_chars = 
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        "abcdefghijklmnopqrstuvwxyz"
        "0123456789+/";
    string encoded;
    int i = 0;
    unsigned char char_array_3[3];
    unsigned char char_array_4[4];
    int in_len = input.length();
    
    while (in_len--) {
        char_array_3[i++] = input[in_len];
        if (i == 3) {
            char_array_4[0] = (char_array_3[0] & 0xfc) >> 2;
            char_array_4[1] = ((char_array_3[0] & 0x03) << 4) + ((char_array_3[1] & 0xf0) >> 4);
            char_array_4[2] = ((char_array_3[1] & 0x0f) << 2) + ((char_array_3[2] & 0xc0) >> 6);
            char_array_4[3] = char_array_3[2] & 0x3f;

            for(i = 0; i < 4; i++)
                encoded = base64_chars[char_array_4[i]] + encoded;
            i = 0;
        }
    }

    if (i) {
        for(int j = i; j < 3; j++)
            char_array_3[j] = '\0';

        char_array_4[0] = (char_array_3[0] & 0xfc) >> 2;
        char_array_4[1] = ((char_array_3[0] & 0x03) << 4) + ((char_array_3[1] & 0xf0) >> 4);
        char_array_4[2] = ((char_array_3[1] & 0x0f) << 2) + ((char_array_3[2] & 0xc0) >> 6);

        for (int j = 0; j < i + 1; j++)
            encoded = base64_chars[char_array_4[j]] + encoded;

        while((i++ < 3))
            encoded = '=' + encoded;
    }
    return encoded;
}

string base64_decode(const string& encoded) {
    static const string base64_chars = 
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        "abcdefghijklmnopqrstuvwxyz"
        "0123456789+/";

    string decoded;
    int in_len = encoded.length();
    int i = 0;
    int in_ = 0;
    unsigned char char_array_4[4], char_array_3[3];

    while (in_len-- && (encoded[in_] != '=')) {
        char_array_4[i++] = encoded[in_]; in_++;
        if (i == 4) {
            for (i = 0; i < 4; i++)
                char_array_4[i] = base64_chars.find(char_array_4[i]);

            char_array_3[0] = (char_array_4[0] << 2) + ((char_array_4[1] & 0x30) >> 4);
            char_array_3[1] = ((char_array_4[1] & 0xf) << 4) + ((char_array_4[2] & 0x3c) >> 2);
            char_array_3[2] = ((char_array_4[2] & 0x3) << 6) + char_array_4[3];

            for (i = 0; i < 3; i++)
                decoded += char_array_3[i];
            i = 0;
        }
    }

    if (i) {
        for (int j = i; j < 4; j++)
            char_array_4[j] = 0;

        for (int j = 0; j < 4; j++)
            char_array_4[j] = base64_chars.find(char_array_4[j]);

        char_array_3[0] = (char_array_4[0] << 2) + ((char_array_4[1] & 0x30) >> 4);
        char_array_3[1] = ((char_array_4[1] & 0xf) << 4) + ((char_array_4[2] & 0x3c) >> 2);
        char_array_3[2] = ((char_array_4[2] & 0x3) << 6) + char_array_4[3];

        for (int j = 0; j < i - 1; j++)
            decoded += char_array_3[j];
    }
    return decoded;
}

// Modify WriteFile function:
void WriteFile(const string& name, const string& content) {
    int idx = FindFile(name);
    if (idx == -1) {
        cout << "Error: File not found.\n";
        return;
    }
    
    string encoded = base64_encode(content);
    if (encoded.size() > FILE_SIZE) {
        cout << "Error: Content too large.\n";
        return;
    }
    
    int start = inodeTable[idx].startBlock;
    memset(&diskData[start], 0, FILE_SIZE);
    memcpy(&diskData[start], encoded.c_str(), encoded.size());
    inodeTable[idx].size = encoded.size();
    inodeTable[idx].cursor = encoded.size();
    SaveDisk();
    cout << "Write complete.\n";
}

// Modify ReadFile function:
void ReadFile(const string& name) {
    int idx = FindFile(name);
    if (idx == -1) {
        cout << "Error: File not found.\n";
        return;
    }
    int start = inodeTable[idx].startBlock;
    int size = inodeTable[idx].size;
    string encoded(diskData.begin() + start, diskData.begin() + start + size);
    string decoded = base64_decode(encoded);
    cout << "Content: " << decoded << "\n";
}

void SeekFile(const string& name, int position) {
    int idx = FindFile(name);
    if (idx == -1) {
        cout << "Error: File not found.\n";
        return;
    }
    if (position < 0 || position >= FILE_SIZE) {
        cout << "Error: Invalid seek position.\n";
        return;
    }
    inodeTable[idx].cursor = position;
    cout << "Cursor moved to position " << position << ".\n";
    SaveDisk();
}

void UpdateFile(const string& name, const string& oldText, const string& newText) {
    int idx = FindFile(name);
    if (idx == -1) {
        cout << "Error: File not found.\n";
        return;
    }

    int start = inodeTable[idx].startBlock;
    int size = inodeTable[idx].size;

    // Read the current content
    string currentContent(diskData.begin() + start, diskData.begin() + start + size);

    if (currentContent.find(oldText) == string::npos) {
        cout << "Error: Text to replace not found.\n";
        return;
    }

    if (currentContent.size() - oldText.size() + newText.size() > FILE_SIZE) {
        cout << "Error: New content exceeds file size.\n";
        return;
    }

    // Replace old text with new text
    size_t pos = currentContent.find(oldText);
    currentContent.replace(pos, oldText.size(), newText);

    // Write safely to disk
    memset(&diskData[start], 0, FILE_SIZE); // Clear previous data
    memcpy(&diskData[start], currentContent.c_str(), currentContent.size());
    inodeTable[idx].size = currentContent.size();
    inodeTable[idx].cursor = currentContent.size();
    SaveDisk();
    cout << "File updated successfully.\n";
}

// Interactive UpdateFile function for shell use
void UpdateFileInteractive(const string& name) {
    int idx = FindFile(name);
    if (idx == -1) {
        cout << "Error: File not found.\n";
        return;
    }

    int start = inodeTable[idx].startBlock;
    int size = inodeTable[idx].size;

    // Read the current content
    string currentContent(diskData.begin() + start, diskData.begin() + start + size);
    cout << "Current content: \n" << currentContent << "\n";

    cout << "Enter the text to replace (part of the content you want to update): ";
    string oldText;
    getline(cin, oldText);

    if (currentContent.find(oldText) == string::npos) {
        cout << "Error: Text to replace not found.\n";
        return;
    }

    cout << "Enter the new text to replace \"" << oldText << "\": ";
    string newText;
    getline(cin, newText);

    if (currentContent.size() - oldText.size() + newText.size() > FILE_SIZE) {
        cout << "Error: New content exceeds file size.\n";
        return;
    }

    // Replace old text with new text
    size_t pos = currentContent.find(oldText);
    currentContent.replace(pos, oldText.size(), newText);

    // Write safely to disk
    memset(&diskData[start], 0, FILE_SIZE); // Clear previous data
    memcpy(&diskData[start], currentContent.c_str(), currentContent.size());
    inodeTable[idx].size = currentContent.size();
    inodeTable[idx].cursor = currentContent.size(); 
    SaveDisk();
    cout << "File updated successfully.\n";
}

void DeleteFile(const string& name) {
    int idx = FindFile(name);
    if (idx == -1) {
        cout << "Error: File not found.\n";
        return;
    }
    inodeTable[idx].used = false;
    inodeTable[idx].size = 0;
    inodeTable[idx].cursor = 0;
    memset(&diskData[inodeTable[idx].startBlock], 0, FILE_SIZE);
    SaveDisk();
    cout << "File deleted.\n";
}

void ListFiles() {
    bool hasFiles = false;
    for (int i = 0; i < MAX_FILES; ++i) {
        if (inodeTable[i].used) {
            cout << inodeTable[i].fileName << " (size: " << inodeTable[i].size << ", cursor: " << inodeTable[i].cursor << ")\n";
            hasFiles = true;
        }
    }
    if (!hasFiles) {
        cout << "No files found.\n";
    }
}

// ============ Main Function ============
int main(int argc, char* argv[]) {
    // Initialize inode table
    for (int i = 0; i < MAX_FILES; ++i) {
        inodeTable[i].used = false;
        inodeTable[i].size = 0;
        inodeTable[i].cursor = 0;
        memset(inodeTable[i].fileName, 0, 100);
    }
    
    // Load existing disk data
    LoadDisk();

    if (argc < 2) {
        cout << "Usage:\n"
             << "vfs create <filename>\n"
             << "vfs write <filename> <content>\n"
             << "vfs read <filename>\n"
             << "vfs update <filename> <old_text> <new_text>\n"
             << "vfs delete <filename>\n"
             << "vfs seek <filename> <position>\n"
             << "vfs ls\n";
        return 1;
    }

    string command = argv[1];

    if (command == "create" && argc == 3) {
        CreateFile(argv[2]);
    }
    else if (command == "write" && argc >= 4) {
        string content;
        for (int i = 3; i < argc; i++) {
            content += argv[i];
            if (i < argc - 1) content += " ";
        }
        WriteFile(argv[2], content);
    }
    else if (command == "read" && argc == 3) {
        ReadFile(argv[2]);
    }
    else if (command == "update" && argc == 5) {
        UpdateFile(argv[2], argv[3], argv[4]);
    }
    else if (command == "delete" && argc == 3) {
        DeleteFile(argv[2]);
    }
    else if (command == "seek" && argc == 4) {
        try {
            SeekFile(argv[2], stoi(argv[3]));
        } catch (const exception& e) {
            cout << "Error: Invalid position number.\n";
            return 1;
        }
    }
    else if (command == "ls" && argc == 2) {
        ListFiles();
    }
    else {
        cout << "Invalid command or arguments.\n";
        return 1;
    }
    SaveDisk();
    return 0;
}