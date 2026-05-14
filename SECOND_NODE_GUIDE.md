# NexusGenesis - 第二nodeSet指南

## 第一步：传输文件

将整个 `C:\Users\Admin\NexusGenesis` 文件夹复制到第二台电脑。

**method：**
- U 盘复制
- network共享
- 任选方式

复制到第二台电脑的任意位置，e.g.：`D:\NexusGenesis`

---

## 第二步：安装依赖

打开终端（命令提示符或 PowerShell）：

```bash
cd D:\NexusGenesis
npm install
```

---

## 第三步：Startnode

```bash
cd D:\NexusGenesis
node src\node\genesisNode.js
```

或双击运行 `start-node.bat`

---

## 第四步：Connect第一node

第二nodeStart后，它会尝试Connect第一个node。

第一个node（您Current这台电脑）requiresensure：
1. **防火墙开放 9847 端口**
2. **在同一局域网内**

---

## 本机info

```
第一node IP: 192.168.3.42
P2P 端口: 9847
```

---

## TestConnect

两个node都Start后，Check日志：
- 如果看到 "New peer connected" = Connectsuccess
- Status 中 Peers: 1 = 有一个Connect

---

## 如有问题

1. ensure两台电脑在同一 WiFi/局域网
2. 暂时关闭防火墙Test：
  ```powershell
  netsh advfirewall set allprofiles state off
  ```
  Test完再打开

---

有问题随时告诉我。
