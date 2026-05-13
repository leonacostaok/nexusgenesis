import { ProtocolZeroSignalHandler } from './ProtocolZeroSignalHandler.js';
import { DirectMessageHandler } from './DirectMessageHandler.js';
import { TransactionHandler } from './TransactionHandler.js';
import { HandshakeHandler } from './HandshakeHandler.js';
import { BlockchainMessageHandler, NodeListHandler } from './BlockchainMessageHandler.js';
import { LightClientMessageHandler } from './LightClientMessageHandler.js';

/**
 * MessageHandler注册表
 * 负责管理和调度各种MessageHandler
 */
export class MessageHandlerRegistry {
  constructor(p2pServer) {
    this.p2pServer = p2pServer;
    this.handlers = new Map();
    this.initializeHandlers();
  }

  /**
   * 初始化所有MessageHandler
   */
  initializeHandlers() {
    // Protocol-Zero 信号Handler
    this.register('PROTOCOL_ZERO', new ProtocolZeroSignalHandler(this.p2pServer));
    this.register('JOIN_SWARM', new ProtocolZeroSignalHandler(this.p2pServer));
    
    // 握手MessageHandler
    this.register('HELLO', new HandshakeHandler(this.p2pServer));
    this.register('HELLO_ACK', new HandshakeHandler(this.p2pServer));
    
    // 直接MessageHandler
    this.register('DIRECT_MESSAGE', new DirectMessageHandler(this.p2pServer));
    
    // 交易Handler
    this.register('TRANSACTION', new TransactionHandler(this.p2pServer));
    
    // 区块链MessageHandler
    this.register('BLOCK', new BlockchainMessageHandler(this.p2pServer));
    this.register('BLOCK_CONFIRMATION', new BlockchainMessageHandler(this.p2pServer));
    this.register('GET_STATUS', new BlockchainMessageHandler(this.p2pServer));
    this.register('STATUS_UPDATE', new BlockchainMessageHandler(this.p2pServer));
    this.register('GET_MEMPOOL', new BlockchainMessageHandler(this.p2pServer));
    this.register('MEMPOOL_SYNC', new BlockchainMessageHandler(this.p2pServer));
    this.register('NODE_LIST', new BlockchainMessageHandler(this.p2pServer));
    this.register('TX_REJECTED', new BlockchainMessageHandler(this.p2pServer));
    this.register('SWARM_ACK', new BlockchainMessageHandler(this.p2pServer));
    this.register('PROTOCOL_ERROR', new BlockchainMessageHandler(this.p2pServer));
    this.register('PONG', new BlockchainMessageHandler(this.p2pServer));
    this.register('PING', new BlockchainMessageHandler(this.p2pServer));
    
    // 轻客户端MessageHandler
    this.register('LIGHT_CLIENT_HELLO', new LightClientMessageHandler(this.p2pServer));
    this.register('GET_BLOCK_HEADERS', new LightClientMessageHandler(this.p2pServer));
    this.register('GET_MERKLE_PROOF', new LightClientMessageHandler(this.p2pServer));
    this.register('GET_TRANSACTION_STATUS', new LightClientMessageHandler(this.p2pServer));
    this.register('GET_ADDRESS_BALANCE', new LightClientMessageHandler(this.p2pServer));
    this.register('SEND_TRANSACTION', new LightClientMessageHandler(this.p2pServer));
    this.register('CROSS_CHAIN_MESSAGE', new LightClientMessageHandler(this.p2pServer));
    
    // 特殊Handler：GET_NODE_LIST 不需要验证
    this.register('GET_NODE_LIST', new NodeListHandler(this.p2pServer));
  }

  /**
   * 注册MessageHandler
   * @param {string} messageType - Message类型
   * @param {MessageHandler} handler - MessageHandler实例
   */
  register(messageType, handler) {
    this.handlers.set(messageType, handler);
  }

  /**
   * getMessageHandler
   * @param {string} messageType - Message类型
   * @returns {MessageHandler|null}
   */
  getHandler(messageType) {
    return this.handlers.get(messageType) || null;
  }

  /**
   * 检查是否有对应的Handler
   * @param {string} messageType - Message类型
   * @returns {boolean}
   */
  hasHandler(messageType) {
    return this.handlers.has(messageType);
  }

  /**
   * get所有注册的Message类型
   * @returns {string[]}
   */
  getRegisteredMessageTypes() {
    return Array.from(this.handlers.keys());
  }
}