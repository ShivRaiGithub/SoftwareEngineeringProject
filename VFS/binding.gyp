{
  "targets": [
    {
      "target_name": "vfs_addon",
      "sources": [
        "vfs_addon.cpp",
        "vfs_disk.cpp",
        "vfs_fileops.cpp",
        "vfs_utils.cpp"
      ],
      "include_dirs": [
        "<!(node -e \"require('nan')\")"
      ],
      "cflags": ["-std=c++11"],
      "cflags_cc": ["-std=c++11"],
      "conditions": [
        ["OS=='win'", {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "AdditionalOptions": ["/std:c++11"]
            }
          }
        }]
      ]
    }
  ]
}