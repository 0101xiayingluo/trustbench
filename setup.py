from setuptools import find_packages, setup


setup(
    name="trustbench-agent",
    version="0.1.0",
    description="Provider-agnostic Python Agent SDK for TrustBench governance and evaluation",
    packages=find_packages(include=["trustbench_agent", "trustbench_agent.*"]),
    python_requires=">=3.11",
)
