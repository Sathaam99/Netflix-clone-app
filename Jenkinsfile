pipeline {
    agent any

    // Triggers the build when code changes are pushed
    triggers {
        githubPush() 
    }

    environment {
        IMAGE_NAME = 'netflix-clone-app'
        CONTAINER_NAME = 'netflix-clone-container'
        HOST_PORT = '8082'
        CONTAINER_PORT = '8080'
        // Host path to the series files which is mounted inside the container
        HOST_VIDEOS_PATH = '/Users/sathaam/Downloads/LOST Series'
    }

    stages {
        stage('Checkout Code') {
            steps {
                checkout scm
            }
        }

        stage('Build Docker Image') {
            steps {
                script {
                    echo "Building Docker image: ${IMAGE_NAME}:latest..."
                    sh "docker build -t ${IMAGE_NAME}:latest ."
                }
            }
        }

        stage('Deploy to Local Endpoint') {
            steps {
                script {
                    echo "Stopping and removing existing container if active..."
                    sh """
                        docker stop ${CONTAINER_NAME} || true
                        docker rm ${CONTAINER_NAME} || true
                    """

                    echo "Starting new container with local series volume mount..."
                    sh """
                        docker run -d \
                        -p ${HOST_PORT}:${CONTAINER_PORT} \
                        -v "${HOST_VIDEOS_PATH}:/videos" \
                        --name ${CONTAINER_NAME} \
                        ${IMAGE_NAME}:latest
                    """
                    
                    echo "Checking container application boot logs..."
                    sh "sleep 3"
                    sh "docker logs ${CONTAINER_NAME}"
                }
            }
        }
    }
    
    post {
        success {
            script {
                echo "Waiting 5 seconds for application server to initialize..."
                sh "sleep 5"
                
                echo "Testing the local endpoint response status..."
                sh "curl -I --noproxy '*' 'http://localhost:${HOST_PORT}/'"
            }
        }
        failure {
            echo "Deployment Failed. Check the Jenkins build logs for details."
        }
    }
}
