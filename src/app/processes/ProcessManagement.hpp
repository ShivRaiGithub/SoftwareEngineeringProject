   #ifndef PROCESS_MANAGEMENT_HPP
   #define PROCESS_MANAGEMENT_HPP
   
   #include "Task.hpp"
   #include <queue>
   #include <memory>
   #include <mutex>

   class ProcessManagement
   {
    public: 
        ProcessManagement();
        bool submitToQueue(std::unique_ptr<Task> task);
        void executeTasks();
    private:
        struct SharedMemory {
            int size;    // std::atmoic <int> was giving error
            char tasks[1000][256];
            int front;
            int rear;

            void printSharedMoemory()
            {
                std::cout<<size<<std::endl;
            }
        };
        SharedMemory* sharedMem;
        int shmFd;
        const char* SHM_NAME = "/my_queue";
    };
 
   #endif