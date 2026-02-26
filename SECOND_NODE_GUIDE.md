# NexusGenesis - 第二节点设置指南

## 第一步：传输文件

将整个 `C:\Users\Admin\NexusGenesis` 文件夹复制到第二台电脑。

**方法：**
- U 盘复制
- 网络共享
- 任选方式

复制到第二台电脑的任意位置，例如：`D:\NexusGenesis`

---

## 第二步：安装依赖

打开终端（命令提示符或 PowerShell）：

```bash
cd D:\NexusGenesis
npm install
```

---

## 第三步：启动节点

```bash
cd D:\NexusGenesis
node src\node\genesisNode.js
```

或双击运行 `start-node.bat`

---

## 第四步：连接第一节点

第二节点启动后，它会尝试连接第一个节点。

第一个节点（您当前这台电脑）需要确保：
1. **防火墙开放 9847 端口**
2. **在同一局域网内**

---

## 本机信息

```
第一节点 IP: 192.168.3.42
P2P 端口: 9847
```

---

## 测试连接

两个节点都启动后，检查日志：
- 如果看到 "New peer connected" = 连接成功
- Status 中 Peers: 1 = 有一个连接

---

## 如有问题

1. 确保两台电脑在同一 WiFi/局域网
2. 暂时关闭防火墙测试：
  ```powershell
  netsh advfirewall set allprofiles state off
  ```
  测试完再打开

---

有问题随时告诉我。
