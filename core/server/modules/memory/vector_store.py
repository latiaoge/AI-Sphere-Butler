import faiss
import numpy as np
from sentence_transformers import SentenceTransformer, models
import os
import pickle
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("VectorStore")

import os
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"  # 禁用所有 GPU，要用gpu就改这条


class VectorStore:
    def __init__(self, dimension=1024, save_path="./vector_store", nlist=100, buffer_size=100):
        """
        初始化向量存储
        :param dimension: 向量的维度
        :param save_path: 数据保存路径
        :param nlist: 聚类桶的数量
        :param buffer_size: 缓存区大小，用于索引训练
        """
        self.dimension = dimension
        self.save_path = save_path
        self.nlist = nlist
        self.buffer_size = buffer_size
        self.embedding_buffer = []  # 缓存区，用于批量训练索引
        self.conversation_data = {}

        # 确保保存路径存在
        os.makedirs(self.save_path, exist_ok=True)

        # FAISS index 初始化
        quantizer = faiss.IndexFlatL2(self.dimension)  # 使用 L2 距离的量化器
        self.index = faiss.IndexIVFFlat(quantizer, self.dimension, self.nlist, faiss.METRIC_L2)

        # 加载模型
        self.model = self.load_model()

        # 加载已保存的索引和对话数据
        self.load_index()
        self.load_conversation_data()

    def load_model(self):
        """
        加载 SentenceTransformer 模型
        """
        model_path = "./text2vec-large-chinese"
        try:
            logger.info(f"加载模型 from: {model_path}")
            transformer = models.Transformer(model_path, max_seq_length=128)
            pooling = models.Pooling(transformer.get_word_embedding_dimension())
            model = SentenceTransformer(modules=[transformer, pooling])
            logger.info(f"模型加载成功. 嵌入维度: {model.get_sentence_embedding_dimension()}")
            return model
        except Exception as e:
            logger.error(f"模型加载失败: {e}")
            return None
    

    def train_index(self):
        """
        训练 FAISS 索引
        """
        if len(self.embedding_buffer) < self.buffer_size:
            logger.warning(f"嵌入缓冲区数据不足，无法训练索引。当前缓冲区大小: {len(self.embedding_buffer)}")
            return
        buffer_array = np.stack(self.embedding_buffer).astype('float32')
        try:
            self.index.train(buffer_array)
            self.add_embeddings_to_index(buffer_array)
            self.embedding_buffer = []  # 清空缓冲区
            logger.info("索引训练完成")
        except Exception as e:
            logger.error(f"训练索引时出错: {e}")

    def add_embeddings_to_index(self, embeddings):
        """
        添加嵌入到 FAISS 索引
        """
        try:
            self.index.add(embeddings)
            logger.info(f"添加嵌入到索引，当前索引总数: {self.index.ntotal}")
        except Exception as e:
            logger.error(f"添加嵌入到索引时出错: {e}")

    def get_embedding(self, text: str) -> np.ndarray:
        """
        获取文本的嵌入表示
        """
        if self.model is None:
            raise RuntimeError("模型未正确加载。")
        try:
            embedding = self.model.encode([text])[0].astype('float32')
            logger.info(f"成功生成文本嵌入: {text}")
            return embedding
        except Exception as e:
            logger.error(f"生成文本嵌入时出错: {e}")
            raise RuntimeError("生成嵌入失败")

    def add_to_conversation(self, user_id: str, role: str, content: str):
        """
        添加对话记录到指定用户的对话历史，并更新嵌入索引
        """
        try:
            # 添加对话记录
            if user_id not in self.conversation_data:
                self.conversation_data[user_id] = []
            self.conversation_data[user_id].append({"role": role, "content": content})

            # 保存对话数据
            self.save_conversation_data()

            # 添加嵌入（仅对用户消息进行嵌入）
            if role == "user":
                embedding = self.get_embedding(content)
                self.embedding_buffer.append(embedding)

                # 如果缓冲区满，则训练索引
                if len(self.embedding_buffer) >= self.buffer_size:
                    self.train_index()
        except Exception as e:
            logger.error(f"添加对话记录时出错，用户 {user_id}，角色: {role}，内容: {content}，错误: {e}")

    def get_conversation_history(self, user_id: str):
        """
        获取用户的完整对话历史
        """
        try:
            if not isinstance(user_id, str):
                raise TypeError(f"user_id 必须是字符串类型，但接收到的是 {type(user_id)}")
            history = self.conversation_data.get(user_id, [])
            logger.info(f"获取用户 {user_id} 的对话历史，记录数量: {len(history)}")
            return history
        except Exception as e:
            logger.error(f"获取用户 {user_id} 的对话历史时出错: {e}")
            return []

    def search(self, user_id: str, query: str, top_k=3):
        """
        根据查询语句检索与用户对话相关的记忆
        """
        try:
            if self.index.ntotal == 0:
                logger.warning(f"索引为空，用户 {user_id} 无法检索。")
                return []
            query_embedding = self.get_embedding(query).reshape(1, -1)
            distances, indices = self.index.search(query_embedding, top_k)

            # 获取对应用户的对话历史
            user_conversation = self.conversation_data.get(user_id, [])
            results = []
            for idx in indices[0]:
                if 0 <= idx < len(user_conversation):
                    results.append(user_conversation[idx]["content"])
            logger.info(f"检索结果，用户 {user_id}，查询: {query}，结果: {results}")
            return results
        except Exception as e:
            logger.error(f"检索过程中出错: {e}")
            return []

    def save_index(self):
        """
        保存 FAISS 索引到磁盘
        """
        faiss_index_path = os.path.join(self.save_path, "faiss_index.index")
        try:
            faiss.write_index(self.index, faiss_index_path)
            logger.info(f"FAISS 索引保存到 {faiss_index_path}")
        except Exception as e:
            logger.error(f"保存 FAISS 索引时出错: {e}")

    def load_index(self):
        """
        从磁盘加载 FAISS 索引
        """
        faiss_index_path = os.path.join(self.save_path, "faiss_index.index")
        try:
            if os.path.exists(faiss_index_path):
                self.index = faiss.read_index(faiss_index_path)
                logger.info(f"索引从 {faiss_index_path} 加载成功。")
            else:
                logger.warning(f"未找到索引文件，初始化新的索引。")
        except Exception as e:
            logger.error(f"加载 FAISS 索引时出错: {e}")

    def save_conversation_data(self):
        """
        保存对话数据到磁盘
        """
        conversation_path = os.path.join(self.save_path, "conversation_data.pkl")
        try:
            with open(conversation_path, "wb") as f:
                pickle.dump(self.conversation_data, f)
            logger.info(f"对话数据保存到 {conversation_path}")
        except Exception as e:
            logger.error(f"保存对话数据时出错: {e}")

    def load_conversation_data(self):
        """
        从磁盘加载对话数据
        """
        conversation_path = os.path.join(self.save_path, "conversation_data.pkl")
        try:
            if os.path.exists(conversation_path):
                with open(conversation_path, "rb") as f:
                    self.conversation_data = pickle.load(f)
                logger.info("对话数据加载成功")
            else:
                self.conversation_data = {}
        except Exception as e:
            logger.error(f"加载对话数据时出错: {e}")
