import axios from 'axios';

async function createTask() {
  try {
    const response = await axios.post('http://localhost:19891/api/agent/tasks/create', {
      agentId: 1,
      taskData: {
        name: 'Test Task',
        description: 'Test task for persistence',
        priority: 'medium',
        difficulty: 5
      }
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    console.log('Task created successfully:', response.data);
  } catch (error) {
    console.error('Error creating task:', error.message);
  }
}

createTask();