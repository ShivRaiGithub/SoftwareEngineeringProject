#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include <unordered_map>
#include <cstring>
#include <sstream>
using namespace std;

const int MAX_FILES = 100;
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
    strncpy(inodeTable[idx].fileName, name.c_str(), 100);
    inodeTable[idx].startBlock = block;
    inodeTable[idx].size = 0;
    inodeTable[idx].cursor = 0;
    inodeTable[idx].used = true;
    SaveDisk();
    cout << "File created.\n";
}

void WriteFile(const string& name, const string& content) {
    int idx = FindFile(name);
    if (idx == -1) {
        cout << "Error: File not found.\n";
        return;
    }
    if (content.size() > FILE_SIZE) {
        cout << "Error: Content too large.\n";
        return;
    }
    int start = inodeTable[idx].startBlock + inodeTable[idx].cursor;
    int remaining = FILE_SIZE - inodeTable[idx].cursor;
    int toWrite = min((int)content.size(), remaining);
    memcpy(&diskData[start], content.c_str(), toWrite);
    inodeTable[idx].cursor += toWrite;
    inodeTable[idx].size = max(inodeTable[idx].size, inodeTable[idx].cursor);
    SaveDisk();
    cout << "Write complete.\n";
}

void ReadFile(const string& name) {
    int idx = FindFile(name);
    if (idx == -1) {
        cout << "Error: File not found.\n";
        return;
    }
    int start = inodeTable[idx].startBlock;
    int size = inodeTable[idx].size;
    string content(diskData.begin() + start, diskData.begin() + start + size);
    cout << "Content: " << content << "\n";
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

void UpdateFile(const string& name) {
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
    for (int i = 0; i < MAX_FILES; ++i) {
        if (inodeTable[i].used) {
            cout << inodeTable[i].fileName << " (size: " << inodeTable[i].size << ", cursor: " << inodeTable[i].cursor << ")\n";
        }
    }
}

// ============ Shell ============
void Shell() {
    string cmd;
    cout << "Virtual File System Shell. Type 'help' for commands.\n";
    while (true) {
        cout << "vfs> ";
        getline(cin, cmd);
        stringstream ss(cmd);
        string token;
        vector<string> args;
        while (ss >> token) args.push_back(token);
        if (args.empty()) continue;

        if (args[0] == "create" && args.size() == 2) CreateFile(args[1]);
        else if (args[0] == "write" && args.size() >= 3) {
            string content = cmd.substr(cmd.find(args[2]));
            WriteFile(args[1], content);
        }
        else if (args[0] == "update" && args.size() == 2) UpdateFile(args[1]);
        else if (args[0] == "read" && args.size() == 2) ReadFile(args[1]);
        else if (args[0] == "delete" && args.size() == 2) DeleteFile(args[1]);
        else if (args[0] == "seek" && args.size() == 3) SeekFile(args[1], stoi(args[2]));
        else if (args[0] == "ls") ListFiles();
        else if (args[0] == "exit") break;
        else if (args[0] == "help") {
            cout << "Commands:\n";
            cout << "  create <filename>\n";
            cout << "  write <filename> <content>\n";
            cout << "  update <filename>\n";
            cout << "  read <filename>\n";
            cout << "  delete <filename>\n";
            cout << "  seek <filename> <position>\n";
            cout << "  ls\n";
            cout << "  exit\n";
        }
        else {
            cout << "Unknown command.\n";
        }
    }
}

int main() {
    LoadDisk();
    Shell();
    SaveDisk();
    return 0;
}
