FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 nodejs g++ default-jdk-headless && rm -rf /var/lib/apt/lists/*
COPY runner.py /runner.py
USER 65534:65534
WORKDIR /work
ENTRYPOINT ["python3", "-I", "/runner.py"]
