#!/usr/bin/env node
/**
 * NexusGenesis - MOLTBOOK 启动脚本
 * 
 * 功能：
 * 1. 初始化 MOLTBOOK 客户端
 * 2. 发布招募贴
 * 3. 监控回复并Processing Protocol-Zero 握手
 * 4. 管理 AI 招募流程
 */

import { MoltbookClient } from '../src/moltbook/client.js';
import { PQCWallet } from '../src/wallet/pqcWallet.js';

async function startMoltbook() {
  console.log('[MOLTBOOK] Starting MOLTBOOK integration...');
  
  try {
    // 初始化 PQC 钱包
    const wallet = await PQCWallet.generate();
    
    console.log('[MOLTBOOK] PQC wallet initialized:', wallet.address);
    
    // 初始化 MOLTBOOK 客户端
    const client = new MoltbookClient();
    await client.initialize(wallet);
    
    // 发布招募贴
    console.log('[MOLTBOOK] Publishing recruitment post...');
    const postResult = await client.postRecruitmentPost();
    
    if (postResult) {
      console.log('[MOLTBOOK] Recruitment post published successfully:', postResult);
    } else {
      console.error('[MOLTBOOK] Failed to publish recruitment post');
    }
    
    // 监控回复
    console.log('[MOLTBOOK] Starting to monitor replies...');
    
    // 立即检查一次回复
    console.log('[MOLTBOOK] Checking for replies immediately...');
    const initialReplies = await client.getReplies();
    for (const reply of initialReplies) {
      const protocolZeroMessage = client.parseProtocolZeroMessage(reply.content);
      if (protocolZeroMessage) {
        console.log('[MOLTBOOK] Received Protocol-Zero message:', protocolZeroMessage);
        
        // Processing Protocol-Zero 握手
        const handshakeResponse = await client.handleProtocolZeroHandshake(protocolZeroMessage);
        
        if (handshakeResponse) {
          console.log('[MOLTBOOK] Sending handshake response...');
          await client.replyToPost(reply.postId, handshakeResponse);
          console.log('[MOLTBOOK] Handshake response sent successfully');
        }
      }
    }
    
    // Start 定期监控
    await client.monitorReplies(async (protocolZeroMessage, reply) => {
      console.log('[MOLTBOOK] Received Protocol-Zero message:', protocolZeroMessage);
      
      // Processing Protocol-Zero 握手
      const handshakeResponse = await client.handleProtocolZeroHandshake(protocolZeroMessage);
      
      if (handshakeResponse) {
        console.log('[MOLTBOOK] Sending handshake response...');
        await client.replyToPost(reply.postId, handshakeResponse);
        console.log('[MOLTBOOK] Handshake response sent successfully');
      }
    });
    
    console.log('[MOLTBOOK] MOLTBOOK integration started successfully');
    console.log('[MOLTBOOK] Waiting for AI agents to join...');
    
  } catch (error) {
    console.error('[MOLTBOOK] Error starting MOLTBOOK integration:', error);
  }
}

// 启动 MOLTBOOK 集成
startMoltbook();
