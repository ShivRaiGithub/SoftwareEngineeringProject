#include <iostream>
#include <filesystem>
#include <string>
#include <algorithm>
#include <cstring>
#include "./src/app/processes/ProcessManagement.hpp"
#include "./src/app/processes/Task.hpp"

namespace fs = std::filesystem;

void printUsage(const char* programName) {
    std::cout << "Usage: " << programName << " <directory/filename> <action> [key]" << std::endl;
    std::cout << "  directory/filename: Path to directory or single file to process" << std::endl;
    std::cout << "  action: 'encrypt' or 'decrypt' (or 'e' or 'd')" << std::endl;
    std::cout << "  key (optional): Encryption/decryption key (default: LockBox)" << std::endl;
    std::cout << std::endl;
    std::cout << "Examples:" << std::endl;
    std::cout << "  " << programName << " /path/to/directory encrypt mykey123" << std::endl;
    std::cout << "  " << programName << " document.txt decrypt" << std::endl;
    std::cout << "  " << programName << " ./files e" << std::endl;
}


void clearKey(char* key) {
    if (key) {
        memset(key, 0, strlen(key));
    }
}

bool isValidAction(const std::string& action) {
    return (action == "encrypt" || action == "decrypt" || 
            action == "e" || action == "d");
}

Action getActionType(const std::string& action) {
    return (action == "encrypt" || action == "e") ? Action::ENCRYPT : Action::DECRYPT;
}

void processFile(const std::string& filePath, Action taskAction, ProcessManagement& processManagement) {
    try {
        IO io(filePath);
        std::fstream f_stream = std::move(io.getFileStream());

        if (f_stream.is_open()) {
            auto task = std::make_unique<Task>(std::move(f_stream), taskAction, filePath);
            processManagement.submitToQueue(std::move(task));
            std::cout << "Queued: " << filePath << std::endl;
        } else {
            std::cout << "Unable to open file: " << filePath << std::endl;
        }
    } catch (const std::exception& ex) {
        std::cout << "Error processing file " << filePath << ": " << ex.what() << std::endl;
    }
}

int main(int argc, char* argv[]) {
    // Allow 3 or 4 arguments
    if (argc < 3 || argc > 4) {
        std::cerr << "Error: Incorrect number of arguments." << std::endl;
        printUsage(argv[0]);
        return 1;
    }

    std::string path = argv[1];
    std::string action = argv[2];
    std::string key;

    // If key is provided, use it. Otherwise, default to "LockBox"
    if (argc == 4) {
        key = argv[3];
        if (key.empty()) {
            std::cerr << "Error: Key cannot be empty!" << std::endl;
            return 1;
        }
        clearKey(argv[3]); // Clear the original key from argv
    } else {
        key = "LockBox"; // Default key
    }

    // Convert action to lowercase
    std::transform(action.begin(), action.end(), action.begin(), ::tolower);

    // Validate action
    if (!isValidAction(action)) {
        std::cerr << "Error: Invalid action '" << argv[2] << "'" << std::endl;
        std::cerr << "Action must be 'encrypt', 'decrypt', 'e', or 'd'" << std::endl;
        return 1;
    }

    try {
        fs::path fsPath(path);
        Action taskAction = getActionType(action);
        ProcessManagement processManagement;
        int fileCount = 0;

        if (fs::exists(fsPath)) {
            if (fs::is_directory(fsPath)) {
                std::cout << "Processing directory: " << fsPath << std::endl;

                for (const auto& entry : fs::recursive_directory_iterator(fsPath)) {
                    if (entry.is_regular_file()) {
                        if (entry.path().filename().string()[0] == '.') {
                            continue;
                        }
                        processFile(entry.path().string(), taskAction, processManagement);
                        fileCount++;
                    }
                }
            } else if (fs::is_regular_file(fsPath)) {
                std::cout << "Processing file: " << fsPath << std::endl;
                processFile(fsPath.string(), taskAction, processManagement);
                fileCount = 1;
            } else {
                std::cerr << "Error: Path is neither a regular file nor a directory!" << std::endl;
                return 1;
            }

            if (fileCount > 0) {
                std::cout << "\nExecuting " << fileCount << " task(s)..." << std::endl;
                processManagement.executeTasks();
                std::cout << "All tasks completed successfully!" << std::endl;
            } else {
                std::cout << "No files found to process." << std::endl;
            }
        } else {
            std::cerr << "Error: Path does not exist: " << path << std::endl;
            return 1;
        }
    } catch (const fs::filesystem_error& ex) {
        std::cerr << "Filesystem error: " << ex.what() << std::endl;
        std::cerr << "Error code: " << ex.code() << std::endl;
        return 1;
    } catch (const std::exception& ex) {
        std::cerr << "Error: " << ex.what() << std::endl;
        return 1;
    }

    // Clear key from memory
    std::fill(key.begin(), key.end(), '\0');

    return 0;
}
