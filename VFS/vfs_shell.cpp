#include "vfs_shell.h"
#include "vfs_fileops.h"
#include "vfs_disk.h"
#include <iostream>
#include <sstream>
#include <vector>

using namespace std;

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
            cout << "Commands:\n"
                 << "  create <filename>\n"
                 << "  write <filename> <content>\n"
                 << "  update <filename>\n"
                 << "  read <filename>\n"
                 << "  delete <filename>\n"
                 << "  seek <filename> <position>\n"
                 << "  ls\n"
                 << "  exit\n";
        }
        else {
            cout << "Unknown command.\n";
        }
    }
}
