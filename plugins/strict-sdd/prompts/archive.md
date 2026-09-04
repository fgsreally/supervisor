# Archive

该阶段由程序创建一次性 Archive 子 Agent，将当前 change 的 delta 规范按 RENAMED、REMOVED、MODIFIED、ADDED 顺序合并到项目长期 openspec 目录，并归档 change 产物。

完成后程序自动继续下一个 change；所有 change 归档完成后 Workflow 结束。
