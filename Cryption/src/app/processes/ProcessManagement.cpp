#include <iostream>
#include "ProcessManagement.hpp"
#include <windows.h>  // Windows process API
#include <memory>
#include <queue>
#include "../encryptDecrypt/Cryption.hpp"

ProcessManagement::ProcessManagement() {}

bool ProcessManagement::submitToQueue(std::unique_ptr<Task> task) {
    taskQueue.push(std::move(task));
    return true;
}

void ProcessManagement::executeTasks() {
    while (!taskQueue.empty()) {
        std::unique_ptr<Task> taskToExecute = std::move(taskQueue.front());
        taskQueue.pop();

        std::string taskStr = taskToExecute->toString();
        std::cout << "Executing task: " << taskStr << std::endl;

        // Build the command line: cryption.exe "taskDataString"
        std::string command = "cryption.exe \"" + taskStr + "\"";

        // Convert to LPSTR
        STARTUPINFOA si{};
        PROCESS_INFORMATION pi{};
        si.cb = sizeof(si);

        char cmdLine[1024];
        strncpy_s(cmdLine, command.c_str(), sizeof(cmdLine) - 1);

        if (!CreateProcessA(
            NULL,
            cmdLine,
            NULL,
            NULL,
            FALSE,
            0,
            NULL,
            NULL,
            &si,
            &pi)) {
            std::cerr << "CreateProcess failed (" << GetLastError() << ").\n";
            continue;
        }

        // Wait for child process to finish
        WaitForSingleObject(pi.hProcess, INFINITE);

        // Close process and thread handles
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
    }
}
